import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  PrismaClient,
  AiRunStatus,
  ProposalOp,
} from "@prisma/client";
import { auth } from "@/auth";
import { buildStoryState, memoryChunksBefore } from "@/lib/context/storyState";

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
    // =====================================================
    // 1. АВТОРИЗАЦИЯ
    // =====================================================

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { id, chapterId } = await params;

    // =====================================================
    // 2. ПРОЕКТ
    // =====================================================

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

    // =====================================================
    // 3. ГЛАВА
    // =====================================================

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

    // =====================================================
    // 4. ИДЕЯ АВТОРА
    // =====================================================

    if (!chapter.authorIdea?.trim()) {
      return NextResponse.json(
        {
          error:
            "У главы пока нет идеи автора. Сначала добавьте идею.",
        },
        { status: 400 }
      );
    }

    // =====================================================
    // 5. OPENAI KEY
    // =====================================================

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY не настроен" },
        { status: 500 }
      );
    }

    // =====================================================
    // 6. CANON FACTS
    //
    // Только подтверждённые факты.
    // =====================================================

    const canonFacts =
      await prisma.canonFact.findMany({
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
          {
            importance: "desc",
          },
          {
            createdAt: "desc",
          },
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

              return `${index + 1}. ${
                fact.negation ? "НЕ " : ""
              }${fact.statement}
${
  fact.entityType
    ? `Тип сущности: ${fact.entityType}.`
    : ""
}
${validity}`;
            })
            .join("\n\n")
        : "Подтверждённых Canon Facts пока нет.";

    // =====================================================
    // 7. ПРЕДЫДУЩЕЕ РЕЗЮМЕ
    // =====================================================

    const previousChapter =
      await prisma.chapter.findFirst({
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

    const previousChapterSummary =
      previousChapter?.chapterSummary
        ? `
Предыдущая глава:
Глава ${previousChapter.number}. ${
            previousChapter.title ||
            "Без названия"
          }

Краткое резюме:
${previousChapter.chapterSummary.shortSummary}

Подробное резюме:
${
  previousChapter.chapterSummary
    .fullSummary ||
  "Нет подробного резюме."
}

Изменения мира:
${
  previousChapter.chapterSummary
    .worldDelta
    ? JSON.stringify(
        previousChapter.chapterSummary
          .worldDelta,
        null,
        2
      )
    : "Нет данных."
}
`
        : "Предыдущего сохранённого резюме нет.";

    // =====================================================
    // 8. MEMORY CHUNKS
    //
    // Пока используем последние сохранённые chunks.
    // Семантический vector search подключим следующим этапом.
    // =====================================================

    // Память только предыдущих глав: будущие главы в контекст не попадают.
    const storyRef = {
      projectId: project.id,
      bookId: chapter.bookId,
      bookNumber: chapter.book.number,
      chapterNumber: chapter.number,
    };

    const memoryChunks =
      await prisma.memoryChunk.findMany({
        where: memoryChunksBefore(storyRef),
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
              return `${index + 1}. [${chunk.kind}]
${chunk.content}
${
  chunk.metadata
    ? `Metadata: ${JSON.stringify(
        chunk.metadata
      )}`
    : ""
}`;
            })
            .join("\n\n")
        : "Сохранённой долгосрочной памяти пока нет.";

    // Накопленное состояние персонажей и отношений на начало главы.
    const storyState = await buildStoryState(storyRef);

    // =====================================================
    // 9. SYSTEM PROMPT
    // =====================================================

    const systemPrompt = `
Ты — Architect внутри Story Architect.

Твоя задача — НЕ писать художественный текст.

Ты анализируешь идею автора главы и превращаешь её
в структурированный план главы.

Главный принцип:

Автор принимает решения.
AI предлагает структуру.

Никогда не изменяй Canon самостоятельно.
Не добавляй факты как подтверждённые.
Не придумывай персонажей, события или правила мира,
если они не следуют из предоставленной информации.

ВАЖНО:

CANON FACTS являются подтверждёнными фактами истории.

MEMORY является контекстом истории.

Предыдущая глава является подтверждённым контекстом
только в той части, которая указана в предоставленном
резюме.

Если Memory содержит неопределённую информацию,
не превращай её автоматически в Canon.

Если информации недостаточно — укажи это явно.

Не выдумывай недостающие факты.

Если авторская идея конфликтует с Canon,
не скрывай конфликт.
Отрази его в openQuestions или mustNotHappen
и оставь решение автору.

Architect НЕ изменяет Canon.

Architect НЕ создаёт персонажей напрямую.

Architect НЕ создаёт события напрямую.

Architect создаёт только предложение плана главы.

Верни только JSON согласно заданной схеме.

Нужно определить:

1. chapterPurpose
Что эта глава должна сделать в истории.

2. initialState
В каком состоянии история и персонажи находятся
в начале главы.

Используй предыдущую главу и Memory,
если они доступны.

3. endState
Что должно измениться к концу главы.

4. plotDevelopment
Какие сюжетные линии могут продвинуться.

5. characterDevelopment
Какие изменения персонажей предполагаются.

6. mustHappen
Что необходимо произвести в главе.

7. mustNotHappen
Что не должно произойти без явного решения автора.

Особенно учитывай подтверждённые Canon Facts.

8. openQuestions
Что осталось неопределённым и требует решения автора.

Не превращай вопросы в факты.
`;

    // =====================================================
    // 10. USER PROMPT
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
CURRENT CHAPTER
=====================================================

Глава:
${chapter.number}. ${
      chapter.title || "Без названия"
    }

Назначение главы:
${chapter.purpose || "Не указано"}

Идея автора:
${chapter.authorIdea}


=====================================================
CANON FACTS
=====================================================

${canonContext}


=====================================================
PREVIOUS CHAPTER MEMORY
=====================================================

${previousChapterSummary}


=====================================================
LONG-TERM MEMORY
=====================================================

${memoryContext}


=====================================================
STORY STATE
(подтверждённое состояние персонажей и отношений на начало главы;
не противоречь ему без явного основания в идее автора)
=====================================================

${storyState}


=====================================================
TASK
=====================================================

Проанализируй идею автора как Architect.

Используй предоставленный Canon и Memory
как контекст для принятия структурных решений.

Не пиши саму главу.

Не изменяй Canon.

Не создавай новые подтверждённые факты.

Сформируй только предложение плана главы.

Если авторская идея противоречит Canon,
обязательно укажи это через openQuestions
или mustNotHappen.
`;

    // =====================================================
    // 11. OPENAI
    // =====================================================

    const response =
      await openai.chat.completions.create({
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

    // =====================================================
    // 12. AI OUTPUT
    // =====================================================

    const rawContent =
      response.choices[0]?.message?.content;

    if (!rawContent) {
      throw new Error(
        "AI не вернул результат"
      );
    }

    const plan = JSON.parse(rawContent);

    // =====================================================
    // 13. AI RUN
    // =====================================================

    const durationMs =
      Date.now() - startedAt;

    const usage = response.usage;

    const aiRun =
      await prisma.aiRun.create({
        data: {
          userId: session.user.id,

          projectId: project.id,

          roleKey:
            "STORY_ARCHITECT",

          model:
            "gpt-5.6-luna",

          inputTokens:
            usage?.prompt_tokens ??
            null,

          outputTokens:
            usage?.completion_tokens ??
            null,

          requestPayload: {
            chapterId: chapter.id,

            authorIdea:
              chapter.authorIdea,

            context: {
              canonFactsCount:
                canonFacts.length,

              memoryChunksCount:
                memoryChunks.length,

              previousChapter:
                previousChapter
                  ? previousChapter.number
                  : null,
            },
          },

          responsePayload: plan,

          contextDebug: {
            canonFacts:
              canonFacts.length,

            memoryChunks:
              memoryChunks.length,

            previousChapter:
              previousChapter
                ? previousChapter.number
                : null,
          },

          durationMs,

          status:
            AiRunStatus.SUCCESS,
        },
      });

    // =====================================================
    // 14. PROPOSAL
    //
    // AI НЕ ПИШЕТ PLAN В CHAPTER.
    //
    // Сначала Proposal.
    // Автор потом принимает / редактирует / отклоняет.
    // =====================================================

    const proposal =
      await prisma.proposal.create({
        data: {
          projectId:
            project.id,

          entityType:
            "chapter_plan",

          entityId:
            chapter.id,

          op:
            ProposalOp.UPDATE,

          payload:
            plan,

          reason:
            "Architect сформировал предложение плана главы на основе идеи автора, Canon и Memory.",

          confidence:
            0.8,

          safety:
            "UNCERTAIN",

          sourceChapterId:
            chapter.id,

          aiRunId:
            aiRun.id,
        },
      });

    // =====================================================
    // 15. RESPONSE
    // =====================================================

    return NextResponse.json({
      ok: true,

      plan,

      proposalId:
        proposal.id,

      aiRunId:
        aiRun.id,

      context: {
        canonFacts:
          canonFacts.length,

        memoryChunks:
          memoryChunks.length,

        previousChapter:
          previousChapter
            ? previousChapter.number
            : null,
      },
    });
  } catch (error) {
    console.error(
      "Architect error:",
      error
    );

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