import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  PrismaClient,
  AiRunStatus,
  ProposalOp,
} from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      chapterId: string;
    }>;
  }
) {
  const startedAt = Date.now();

  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { id, chapterId } = await params;

    const project = await prisma.project.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        premise: true,
        genre: true,
        tone: true,
        projectRules: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Проект не найден" },
        { status: 404 }
      );
    }

    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        book: {
          projectId: project.id,
        },
      },
      include: {
        book: true,
      },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "Глава не найдена" },
        { status: 404 }
      );
    }

    if (!chapter.authorIdea?.trim()) {
      return NextResponse.json(
        {
          error:
            "У главы пока нет идеи автора. Сначала добавьте идею.",
        },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY не настроен" },
        { status: 500 }
      );
    }

    // =====================================================
    // CANON FACTS
    // =====================================================

    const canonFacts = await prisma.canonFact.findMany({
      where: {
        projectId: project.id,
        status: "CANON",
      },
      select: {
        statement: true,
        negation: true,
        entityType: true,
        validFromChapter: true,
        validToChapter: true,
        importance: true,
      },
      orderBy: [
        { importance: "desc" },
        { createdAt: "desc" },
      ],
      take: 100,
    });

    const canonContext =
      canonFacts.length > 0
        ? canonFacts
            .map((fact, index) => {
              const validity =
                fact.validFromChapter !== null ||
                fact.validToChapter !== null
                  ? `Действует с главы ${
                      fact.validFromChapter ?? "начала"
                    } по ${
                      fact.validToChapter ?? "настоящее время"
                    }.`
                  : "";

              return `${index + 1}. ${fact.negation ? "НЕ " : ""}${fact.statement}
${fact.entityType ? `Тип сущности: ${fact.entityType}.` : ""}
${validity}`;
            })
            .join("\n\n")
        : "Подтверждённых Canon Facts пока нет.";

    // =====================================================
    // IMMEDIATE PREVIOUS CANON CHAPTER
    // =====================================================

    const previousChapter = await prisma.chapter.findFirst({
      where: {
        bookId: chapter.bookId,
        number: {
          lt: chapter.number,
        },
        status: "CANON",
      },
      orderBy: {
        number: "desc",
      },
      include: {
        chapterSummary: true,
      },
    });

    // =====================================================
    // PREVIOUS CHAPTER MEMORY
    //
    // The immediate previous CANON chapter gets priority.
    // If chapterSummary exists, use it. If not, use the
    // Memory Chunks produced for that chapter.
    // =====================================================

    let previousChapterMemoryChunks: Array<{
      kind: string;
      content: string;
      metadata: unknown;
    }> = [];

    if (previousChapter) {
      previousChapterMemoryChunks =
        await prisma.memoryChunk.findMany({
          where: {
            projectId: project.id,
            chapterId: previousChapter.id,
          },
          select: {
            kind: true,
            content: true,
            metadata: true,
          },
          orderBy: {
            createdAt: "asc",
          },
          take: 50,
        });
    }

    const previousChapterSummary = previousChapter
      ? `
ПРЕДЫДУЩАЯ УТВЕРЖДЁННАЯ ГЛАВА:
Глава ${previousChapter.number}. ${
          previousChapter.title || "Без названия"
        }

Статус:
CANON — эта глава уже является подтверждённой частью истории.

$${previousChapter.chapterSummary ? "" : ""}КРАТКОЕ РЕЗЮМЕ:
${
  previousChapter.chapterSummary?.shortSummary ||
  "Резюме главы отдельно не сохранено."
}

ПОДРОБНОЕ РЕЗЮМЕ:
${
  previousChapter.chapterSummary?.fullSummary ||
  "Подробное резюме главы отдельно не сохранено."
}

ИЗМЕНЕНИЯ МИРА:
${
  previousChapter.chapterSummary?.worldDelta
    ? JSON.stringify(
        previousChapter.chapterSummary.worldDelta,
        null,
        2
      )
    : "Отдельные изменения мира не сохранены в Chapter Summary."
}

MEMORY ЧАСТИ ПРЕДЫДУЩЕЙ ГЛАВЫ:
${
  previousChapterMemoryChunks.length > 0
    ? previousChapterMemoryChunks
        .map(
          (chunk, index) =>
            `${index + 1}. [${chunk.kind}]\n${chunk.content}\n${
              chunk.metadata
                ? `Metadata: ${JSON.stringify(chunk.metadata)}`
                : ""
            }`
        )
        .join("\n\n")
    : "Для этой главы отдельные Memory Chunks не найдены."
}
`
      : "Предыдущей CANON-главы для этой главы нет.";

    // =====================================================
    // LONG-TERM MEMORY
    //
    // Keep broader project memory, but do not let it replace
    // the immediate previous chapter context above.
    // =====================================================

    const memoryChunks = await prisma.memoryChunk.findMany({
      where: {
        projectId: project.id,
        OR: [
          { chapterId: null },
          {
            chapterId: {
              not: chapter.id,
            },
          },
        ],
      },
      select: {
        kind: true,
        content: true,
        metadata: true,
        chapterId: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 30,
    });

    const memoryContext =
      memoryChunks.length > 0
        ? memoryChunks
            .map((chunk, index) => {
              return `${index + 1}. [${chunk.kind}]${
                chunk.chapterId
                  ? ` [chapterId=${chunk.chapterId}]`
                  : " [project]"
              }
${chunk.content}
${
  chunk.metadata
    ? `Metadata: ${JSON.stringify(chunk.metadata)}`
    : ""
}`;
            })
            .join("\n\n")
        : "Сохранённой долгосрочной памяти пока нет.";

    // =====================================================
    // SYSTEM PROMPT
    // =====================================================

    const systemPrompt = `
Ты — Architect внутри Story Architect.

Твоя задача — НЕ писать художественный текст.
Ты анализируешь идею автора текущей главы и превращаешь её
в структурированный план этой главы.

Главный принцип:
Автор принимает решения.
AI предлагает структуру.

ИЕРАРХИЯ КОНТЕКСТА:
1. CANON — высший уровень подтверждённой истины.
2. Непосредственная предыдущая глава со статусом CANON —
   подтверждённое состояние истории на входе в текущую главу.
3. Memory предыдущей главы — сохранённый контекст,
   который помогает продолжить историю, но не превращается
   автоматически в новый Canon Fact.
4. Остальная долгосрочная Memory — дополнительный контекст.
5. Идея автора текущей главы — задача, которую Architect
   должен структурировать с учётом уровней выше.

ВАЖНО:

- Никогда не изменяй Canon самостоятельно.
- Не добавляй факты как подтверждённые.
- Не придумывай персонажей, события или правила мира,
  если они не следуют из предоставленной информации.
- Не игнорируй непосредственную предыдущую CANON-главу.
- Если для предыдущей CANON-главы нет отдельного Chapter Summary,
  используй её Memory Chunks, если они доступны.
- Не утверждай, что предыдущая глава неизвестна, если её текстовый
  контекст или Memory действительно предоставлены.
- Если Memory содержит неопределённую информацию,
  не превращай её автоматически в Canon.
- Если информации недостаточно — укажи это явно.
- Если авторская идея конфликтует с Canon, не скрывай конфликт.
  Отрази его в openQuestions или mustNotHappen и оставь решение автору.

Architect НЕ изменяет Canon.
Architect НЕ создаёт персонажей напрямую.
Architect НЕ создаёт события напрямую.
Architect создаёт только предложение плана текущей главы.

Верни только JSON согласно заданной схеме.

Нужно определить:
1. chapterPurpose — что эта глава должна сделать в истории.
2. initialState — фактическое состояние истории и персонажей
   в начале главы. В первую очередь опирайся на непосредственную
   предыдущую CANON-главу и её Memory.
3. endState — что должно измениться к концу главы.
4. plotDevelopment — какие сюжетные линии могут продвинуться.
5. characterDevelopment — какие изменения персонажей предполагаются.
6. mustHappen — что необходимо произвести в главе.
7. mustNotHappen — что не должно произойти без явного решения автора.
8. openQuestions — что осталось неопределённым и требует решения автора.

Не превращай вопросы в факты.
`;

    // =====================================================
    // USER PROMPT
    // =====================================================

    const userPrompt = `
=====================================================
PROJECT
=====================================================

Название:
${project.name}

Premise:
${project.premise || "Не указано"}

Жанр:
${project.genre || "Не указан"}

Тон:
${project.tone || "Не указан"}

Правила проекта:
${project.projectRules || "Не указаны."}

=====================================================
BOOK
=====================================================

Название:
${chapter.book.title}

Премиса книги:
${chapter.book.premise || "Не указана"}

Основная сюжетная линия книги:
${chapter.book.mainArc || "Не указана"}

Запланированный финал:
${chapter.book.plannedEnding || "Не указан."}

=====================================================
CURRENT CHAPTER TO PLAN
=====================================================

Глава:
${chapter.number}. ${chapter.title || "Без названия"}

Назначение главы:
${chapter.purpose || "Не указано"}

Идея автора:
${chapter.authorIdea}

=====================================================
CANON FACTS
=====================================================

${canonContext}

=====================================================
IMMEDIATE PREVIOUS CANON CHAPTER
=====================================================

${previousChapterSummary}

=====================================================
LONG-TERM MEMORY
=====================================================

${memoryContext}

=====================================================
TASK
=====================================================

Проанализируй идею автора для ТЕКУЩЕЙ главы как Architect.

Текущая глава не является предыдущей главой: предыдущая глава
передана выше отдельным блоком. Используй её как непосредственное
состояние на входе в текущую главу.

Используй Canon и Memory как контекст для структурных решений.

Не пиши саму главу.
Не изменяй Canon.
Не создавай новые подтверждённые факты.
Сформируй только предложение плана текущей главы.

Если авторская идея противоречит Canon или подтверждённому
состоянию предыдущей главы, обязательно укажи это через
openQuestions или mustNotHappen.
`;

    // =====================================================
    // OPENAI
    // =====================================================

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",

      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],

      response_format: {
        type: "json_schema",
        json_schema: {
          name: "chapter_architect_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              chapterPurpose: {
                type: "string",
              },
              initialState: {
                type: "string",
              },
              endState: {
                type: "string",
              },
              plotDevelopment: {
                type: "array",
                items: {
                  type: "string",
                },
              },
              characterDevelopment: {
                type: "array",
                items: {
                  type: "string",
                },
              },
              mustHappen: {
                type: "array",
                items: {
                  type: "string",
                },
              },
              mustNotHappen: {
                type: "array",
                items: {
                  type: "string",
                },
              },
              openQuestions: {
                type: "array",
                items: {
                  type: "string",
                },
              },
            },
            required: [
              "chapterPurpose",
              "initialState",
              "endState",
              "plotDevelopment",
              "characterDevelopment",
              "mustHappen",
              "mustNotHappen",
              "openQuestions",
            ],
          },
        },
      },
    });

    const rawContent =
      response.choices[0]?.message?.content;

    if (!rawContent) {
      throw new Error("AI не вернул результат");
    }

    const plan = JSON.parse(rawContent);

    // =====================================================
    // AI RUN
    // =====================================================

    const durationMs = Date.now() - startedAt;
    const usage = response.usage;

    const aiRun = await prisma.aiRun.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        roleKey: "STORY_ARCHITECT",
        model: "gpt-5.6-luna",
        inputTokens: usage?.prompt_tokens ?? null,
        outputTokens: usage?.completion_tokens ?? null,
        requestPayload: {
          chapterId: chapter.id,
          authorIdea: chapter.authorIdea,
          context: {
            canonFactsCount: canonFacts.length,
            memoryChunksCount: memoryChunks.length,
            previousChapterMemoryChunksCount:
              previousChapterMemoryChunks.length,
            previousChapter: previousChapter
              ? previousChapter.number
              : null,
          },
        },
        responsePayload: plan,
        contextDebug: {
          canonFacts: canonFacts.length,
          memoryChunks: memoryChunks.length,
          previousChapterMemoryChunks:
            previousChapterMemoryChunks.length,
          previousChapter: previousChapter
            ? previousChapter.number
            : null,
        },
        durationMs,
        status: AiRunStatus.SUCCESS,
      },
    });

    // =====================================================
    // PROPOSAL
    // =====================================================

    const proposal = await prisma.proposal.create({
      data: {
        projectId: project.id,
        entityType: "chapter_plan",
        entityId: chapter.id,
        op: ProposalOp.UPDATE,
        payload: plan,
        reason:
          "Architect сформировал предложение плана главы на основе идеи автора, Canon, непосредственной предыдущей CANON-главы и Memory.",
        confidence: 0.8,
        safety: "UNCERTAIN",
        sourceChapterId: chapter.id,
        aiRunId: aiRun.id,
      },
    });

    return NextResponse.json({
      ok: true,
      plan,
      proposalId: proposal.id,
      aiRunId: aiRun.id,
      context: {
        canonFacts: canonFacts.length,
        memoryChunks: memoryChunks.length,
        previousChapter: previousChapter
          ? previousChapter.number
          : null,
        previousChapterMemoryChunks:
          previousChapterMemoryChunks.length,
      },
    });
  } catch (error) {
    console.error("Architect error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Architect не смог выполнить анализ",
      },
      { status: 500 }
    );
  }
}
