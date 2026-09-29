import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import OpenAI from "openai";

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      chapterId: string;
    }>;
  }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      include: {
        book: true,
        scenes: { orderBy: { order: "asc" } },
      },
    });

    if (!chapter) {
      return NextResponse.json({ error: "Глава не найдена" }, { status: 404 });
    }

    if (!chapter.plan || !chapter.planApproved) {
      return NextResponse.json(
        { error: "Сначала необходимо утвердить план главы." },
        { status: 400 }
      );
    }

    if (!chapter.scenes || chapter.scenes.length === 0) {
      return NextResponse.json(
        { error: "Сначала необходимо сформировать план сцен." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY не настроен." },
        { status: 500 }
      );
    }

    const [canonFacts, previousChapter, memoryChunks] = await Promise.all([
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
        select: {
          statement: true,
          negation: true,
          entityType: true,
          validFromChapter: true,
          validToChapter: true,
          importance: true,
        },
        orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),

      prisma.chapter.findFirst({
        where: {
          bookId: chapter.bookId,
          number: { lt: chapter.number },
          status: "CANON",
        },
        orderBy: { number: "desc" },
        include: { chapterSummary: true },
      }),

      prisma.memoryChunk.findMany({
        where: {
          projectId: project.id,
          OR: [{ chapterId: null }, { chapterId: { not: chapter.id } }],
        },
        select: { kind: true, content: true, metadata: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    const canonContext = canonFacts.length
      ? canonFacts
          .map(
            (fact, index) =>
              `${index + 1}. ${fact.negation ? "НЕ " : ""}${fact.statement}`
          )
          .join("\n")
      : "Подтверждённых Canon Facts пока нет.";

    const previousChapterSummary = previousChapter?.chapterSummary
      ? `Глава ${previousChapter.number}: ${previousChapter.title || "Без названия"}\n${previousChapter.chapterSummary.shortSummary}\n${previousChapter.chapterSummary.fullSummary || ""}`
      : "Предыдущего сохранённого резюме нет.";

    const memoryContext = memoryChunks.length
      ? memoryChunks
          .map((chunk, index) => `${index + 1}. [${chunk.kind}] ${chunk.content}`)
          .join("\n\n")
      : "Сохранённой долгосрочной памяти пока нет.";

    const scenes = chapter.scenes.map((scene) => ({
      order: scene.order,
      title: scene.title,
      purpose: scene.purpose,
      plan: scene.plan,
      plannedOutcome: scene.plannedOutcome,
    }));

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content: `
Ты — AI Writer в системе Story Architect.

Напиши художественный ЧЕРНОВИК главы на основе утверждённого плана,
плана сцен и подтверждённого Story Bible контекста.

ПРИОРИТЕТ:
1. Подтверждённый Canon.
2. Утверждённый план главы.
3. Утверждённый план сцен.
4. Идея автора.
5. Предыдущая глава и Memory как исторический контекст.

ПРАВИЛА:
- Не нарушай Canon.
- Не придумывай новые важные факты, фракции, способности или крупные события.
- Не раскрывай неизвестные тайны.
- Не превращай открытые вопросы в факты.
- Учитывай состояние персонажей и причинно-следственную связь.
- Не меняй порядок и смысл утверждённых сцен.
- Не превращай черновик в Canon.
- Верни только художественный текст главы.
`,
        },
        {
          role: "user",
          content: `
Проект: ${project.name}

Книга: ${chapter.book.title || `Книга ${chapter.book.number}`}
Глава: ${chapter.title || `Глава ${chapter.number}`}
Цель главы: ${chapter.purpose || "Не указана"}
Идея автора: ${chapter.authorIdea || "Не указана"}

CANON FACTS:
${canonContext}

ПРЕДЫДУЩАЯ ГЛАВА:
${previousChapterSummary}

LONG-TERM MEMORY:
${memoryContext}

УТВЕРЖДЁННЫЙ ПЛАН ГЛАВЫ:
${JSON.stringify(chapter.plan, null, 2)}

УТВЕРЖДЁННЫЙ ПЛАН СЦЕН:
${JSON.stringify(scenes, null, 2)}

Верни только текст художественного черновика.
`,
        },
      ],
      text: { format: { type: "text" } },
    });

    const draftText = response.output_text?.trim();

    if (!draftText) {
      return NextResponse.json(
        { error: "AI не вернул текст черновика." },
        { status: 500 }
      );
    }

    const wordCount = draftText.split(/\s+/).filter(Boolean).length;

    const updatedChapter = await prisma.chapter.update({
      where: { id: chapter.id },
      data: { draftText, wordCount, status: "DRAFT" },
    });

    return NextResponse.json({
      ok: true,
      chapterId: updatedChapter.id,
      draftText,
      wordCount,
    });
  } catch (error) {
    console.error("Writer error:", error);
    return NextResponse.json(
      { error: "Не удалось создать черновик главы." },
      { status: 500 }
    );
  }
}
