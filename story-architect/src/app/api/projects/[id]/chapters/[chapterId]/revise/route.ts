import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { splitAuthorNotes } from "@/lib/authorIntent/prompt";
import { buildStoryState } from "@/lib/context/storyState";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/provider";
import { BudgetExceededError, createPrismaTrackingDeps, runTrackedAiCall } from "@/lib/ai/budget";
import { limitsFor } from "@/lib/ai/limits";
import {
  MAX_REVISE_CHARS,
  buildReviseMessages,
  splitDraftAndNotes,
} from "@/lib/chapters/reviseDraft";
import { hasEditorMarks, stripEditorMarks } from "@/lib/chapters/editorMarks";

const MODEL = "gpt-5.6-luna";

/**
 * Предлагает версию черновика с вплетёнными заметками автора.
 * НИЧЕГО не сохраняет: автор сам решает, принять ли результат
 * (принятие идёт обычным сохранением черновика).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id, chapterId } = await params;

    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, name: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, book: { projectId: project.id } },
      include: { book: true },
    });
    if (!chapter) {
      return NextResponse.json({ error: "Глава не найдена" }, { status: 404 });
    }

    let body: { draftText?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    // Текст из редактора (даже несохранённый); иначе сохранённый черновик.
    const source =
      typeof body.draftText === "string" ? body.draftText : chapter.draftText ?? "";

    if (!source.trim()) {
      return NextResponse.json({ error: "Черновик пуст." }, { status: 400 });
    }
    if (source.length > MAX_REVISE_CHARS) {
      return NextResponse.json(
        { error: "Черновик слишком длинный для доработки за один раз." },
        { status: 400 }
      );
    }

    const parts = splitDraftAndNotes(source);
    const marked = hasEditorMarks(source);
    if (!parts && !marked) {
      return NextResponse.json(
        {
          error:
            "Не нашёл, что дорабатывать. Выдели фрагмент и добавь к нему комментарий или вопрос, либо добавь в конец черновика блок заметок («Свободные заметки» или «ЗАМЕТКИ ДЛЯ ДОРАБОТКИ»).",
        },
        { status: 400 }
      );
    }

    if (!hasOpenAIKey()) {
      return NextResponse.json(
        { error: "Провайдер OpenAI не настроен" },
        { status: 500 }
      );
    }

    const storyRef = {
      projectId: project.id,
      bookId: chapter.bookId,
      bookNumber: chapter.book.number,
      chapterNumber: chapter.number,
    };

    const [canonFacts, storyState] = await Promise.all([
      prisma.canonFact.findMany({
        where: {
          projectId: project.id,
          status: "CANON",
          OR: [
            { validFromChapter: null },
            { validFromChapter: { lte: chapter.number } },
          ],
          AND: [
            {
              OR: [
                { validToChapter: null },
                { validToChapter: { gte: chapter.number } },
              ],
            },
          ],
        },
        select: { statement: true, negation: true },
        orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
      buildStoryState(storyRef),
    ]);

    const canon = canonFacts.length
      ? canonFacts
          .map((f, i) => `${i + 1}. ${f.negation ? "НЕ " : ""}${f.statement}`)
          .join("\n")
      : "Подтверждённых Canon Facts пока нет.";

    const { system, user } = buildReviseMessages({
      projectName: project.name,
      chapterTitle: chapter.title || `Глава ${chapter.number}`,
      canon,
      storyState,
      prose: parts ? parts.prose : source.trim(),
      notes: parts ? parts.notes : "",
      hasMarks: marked,
    });

    // Потоковый запрос: длинный ответ идёт частями, соединение не простаивает
    // и не обрывается, как при ожидании целого ответа одним куском.
    // Учёт расходов и месячный лимит. Поток остаётся потоковым; если он
    // оборвётся после первого события, расход учитывается по резерву.
    const response = await runTrackedAiCall(
      createPrismaTrackingDeps(prisma),
      { userId: session.user.id, projectId: project.id, roleKey: "REVISE", provider: "openai", model: MODEL },
      async (ctx) => {
        const stream = getOpenAIClient().responses.stream({
          model: MODEL,
          max_output_tokens: limitsFor("REVISE").maxOutputTokens,
          input: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          text: { format: { type: "text" } },
        });
        stream.on("event", () => ctx.markBillable());
        const final = await stream.finalResponse();
        return { value: final, usage: final.usage };
      }
    );

    if (response.status === "incomplete") {
      return NextResponse.json(
        { error: "Ответ модели обрезан лимитом длины. Версия не предложена, повторите запуск." },
        { status: 502 }
      );
    }

    const raw = response.output_text?.trim();
    if (!raw) {
      return NextResponse.json(
        { error: "AI не вернул текст." },
        { status: 502 }
      );
    }

    const { text: modelText, notes: remarks } = splitAuthorNotes(raw);
    // Страховка: пометки не должны попасть в итоговый текст главы.
    const revisedText = stripEditorMarks(modelText);

    return NextResponse.json({
      ok: true,
      revisedText,
      remarks,
      originalProse: parts ? parts.prose : source.trim(),
      notes: parts ? parts.notes : "",
    });
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return NextResponse.json(
        { error: error.message, code: "BUDGET_EXCEEDED" },
        { status: 429 }
      );
    }
    console.error("Revise draft error:", error);

    const text = String(
      (error as { message?: unknown })?.message ?? ""
    ).toLowerCase();
    const cause = String(
      (error as { cause?: { code?: unknown } })?.cause?.code ?? ""
    );
    if (
      text.includes("terminated") ||
      text.includes("connection error") ||
      text.includes("fetch failed") ||
      cause.startsWith("UND_ERR")
    ) {
      return NextResponse.json(
        {
          error:
            "Соединение с OpenAI оборвалось. Проверь VPN в терминале и повтори.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "Не удалось доработать черновик." },
      { status: 500 }
    );
  }
}
