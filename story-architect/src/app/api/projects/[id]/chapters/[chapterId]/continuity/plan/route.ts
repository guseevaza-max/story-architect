import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { loadAuthorDirectionBlock } from "@/lib/authorIntent/load";
import { buildStoryState } from "@/lib/context/storyState";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/provider";
import { BudgetExceededError, createPrismaTrackingDeps, runTrackedAiCall } from "@/lib/ai/budget";
import { InputTooLargeError, inputEstimate, limitsFor } from "@/lib/ai/limits";
import { loadNarrativeContext } from "@/lib/plotMap/loadNarrative";
import {
  PLAN_CHECK_LEVEL,
  PLAN_CHECK_ROLE,
  PLAN_CHECK_SCHEMA,
  PLAN_CHECK_SYSTEM_PROMPT,
  buildPlanCheckUserPrompt,
  hasPlanToCheck,
  parsePlanReport,
  severityToRow,
} from "@/lib/continuity/planCheck";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

/**
 * Pre-Writer Continuity: проверка плана главы и плана сцен до написания текста.
 * Черновик не нужен. Статус главы не меняется (CHECKING относится к проверке текста),
 * Canon не затрагивается. Отчёт сохраняется с level = 0 и не смешивается с отчётами по тексту.
 */
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: projectId, chapterId } = await params;
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
    if (!project) return NextResponse.json({ error: "Проект не найден." }, { status: 404 });

    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, book: { projectId } },
      include: { book: true, scenes: { orderBy: { order: "asc" } } },
    });
    if (!chapter) return NextResponse.json({ error: "Глава не найдена." }, { status: 404 });

    if (!hasPlanToCheck(chapter.plan, chapter.scenes)) {
      return NextResponse.json({ error: "Проверять пока нечего: сначала получите и утвердите план главы или план сцен." }, { status: 400 });
    }

    if (!hasOpenAIKey()) return NextResponse.json({ error: "Провайдер OpenAI не настроен" }, { status: 500 });
    const openai = getOpenAIClient();

    const [storyState, authorBlock, narrative, canonFacts] = await Promise.all([
      buildStoryState({ projectId: project.id, bookId: chapter.bookId, bookNumber: chapter.book.number, chapterNumber: chapter.number }),
      loadAuthorDirectionBlock(project.id, chapter.id, "continuity"),
      loadNarrativeContext({ bookId: chapter.bookId, number: chapter.number, projectId: project.id }),
      prisma.canonFact.findMany({
        where: {
          projectId: project.id,
          status: "CANON",
          OR: [{ validFromChapter: null }, { validFromChapter: { lte: chapter.number } }],
          AND: [{ OR: [{ validToChapter: null }, { validToChapter: { gte: chapter.number } }] }],
        },
        select: { statement: true, negation: true },
        orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
    ]);

    const userPrompt = buildPlanCheckUserPrompt({
      projectName: project.name,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      purpose: chapter.purpose,
      authorIdea: chapter.authorIdea,
      plan: chapter.plan,
      scenes: chapter.scenes,
      canonFacts,
      storyState,
      authorBlock,
      narrativeBlock: narrative.promptBlock,
    });

    const response = await runTrackedAiCall(
      createPrismaTrackingDeps(prisma),
      {
        userId: session.user.id,
        projectId: project.id,
        roleKey: PLAN_CHECK_ROLE,
        provider: "openai",
        model: "gpt-5.6-luna",
        estimate: inputEstimate(PLAN_CHECK_ROLE, PLAN_CHECK_SYSTEM_PROMPT + userPrompt),
      },
      async () => {
        const aiResponse = await openai.responses.create({
          model: "gpt-5.6-luna",
          max_output_tokens: limitsFor(PLAN_CHECK_ROLE).maxOutputTokens,
          input: [
            { role: "system", content: PLAN_CHECK_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          text: { format: { type: "json_schema", name: "plan_continuity_report", strict: true, schema: PLAN_CHECK_SCHEMA as unknown as Record<string, unknown> } },
        });
        return { value: aiResponse, usage: aiResponse.usage };
      }
    );

    const output = response.output_text?.trim();
    if (!output) return NextResponse.json({ error: "AI не вернул отчёт проверки." }, { status: 500 });

    const report = parsePlanReport(output);
    if (!report) return NextResponse.json({ error: "AI вернул некорректный JSON отчёта." }, { status: 500 });

    let saved;
    try {
      saved = await prisma.continuityReport.create({
        data: {
          chapterId: chapter.id,
          level: PLAN_CHECK_LEVEL,
          summary: report.summary as Prisma.InputJsonValue,
          issues: {
            create: report.issues.map((issue) => ({
              ...severityToRow(issue.severity),
              category: issue.type,
              title: issue.problem,
              evidence: issue.evidence as Prisma.InputJsonValue,
              explanations: { recommendation: issue.recommendation, location: issue.location } as Prisma.InputJsonValue,
              confidence: null,
              suggestedResolutions: { recommendation: issue.recommendation } as Prisma.InputJsonValue,
              resolved: false,
              resolution: null,
            })),
          },
        },
        include: { issues: true },
      });
    } catch (error) {
      console.error("Plan continuity report save error:", error);
      return NextResponse.json({ error: "AI проверку выполнил, но сохранить отчёт в базу не удалось." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, report: { id: saved.id, status: report.status, summary: report.summary, issues: saved.issues } });
  } catch (error) {
    if (error instanceof BudgetExceededError) return NextResponse.json({ error: error.message, code: "BUDGET_EXCEEDED" }, { status: 429 });
    if (error instanceof InputTooLargeError) return NextResponse.json({ error: error.message, code: "INPUT_TOO_LARGE" }, { status: 413 });
    console.error("Plan continuity check error:", error);
    return NextResponse.json({ error: "Не удалось выполнить проверку плана." }, { status: 500 });
  }
}
