import { NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import OpenAI from "openai";

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function toInputJson(
  value: unknown
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value)
  ) as Prisma.InputJsonValue;
}

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
    // =====================================================
    // 1. АВТОРИЗАЦИЯ
    // =====================================================

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error: "Не авторизован.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      id: projectId,
      chapterId,
    } = await params;

    // =====================================================
    // 2. ПРОЕКТ
    // =====================================================

    const project =
      await prisma.project.findFirst({
        where: {
          id: projectId,
          userId: session.user.id,
        },
      });

    if (!project) {
      return NextResponse.json(
        {
          error: "Проект не найден.",
        },
        {
          status: 404,
        }
      );
    }

    // =====================================================
    // 3. ГЛАВА
    // =====================================================

    const chapter =
      await prisma.chapter.findFirst({
        where: {
          id: chapterId,
          book: {
            projectId: projectId,
          },
        },
        include: {
          book: true,
        },
      });

    if (!chapter) {
      return NextResponse.json(
        {
          error: "Глава не найдена.",
        },
        {
          status: 404,
        }
      );
    }

    // =====================================================
    // 4. ГЛАВА ДОЛЖНА БЫТЬ В CANON
    // =====================================================

    if (chapter.status !== "CANON") {
      return NextResponse.json(
        {
          error:
            "Memory Update можно запускать только после добавления главы в Canon.",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // 5. ТЕКСТ ГЛАВЫ
    // =====================================================

    const chapterText =
      chapter.finalText?.trim() ||
      chapter.draftText?.trim();

    if (!chapterText) {
      return NextResponse.json(
        {
          error:
            "У главы нет утверждённого текста.",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // 6. OPENAI KEY
    // =====================================================

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY не настроен.",
        },
        {
          status: 500,
        }
      );
    }

    // =====================================================
    // 7. AI MEMORY EXTRACTION
    // =====================================================

    const startedAt = Date.now();

    const response =
      await openai.responses.create({
        model: "gpt-5.6-luna",

        input: [
          {
            role: "system",
            content: `
Ты — MEMORY EXTRACTION AGENT системы Story Architect.

Твоя задача — анализировать УТВЕРЖДЁННУЮ главу книги и определить,
какие изменения должны попасть в память истории.

КАТЕГОРИИ ИЗМЕНЕНИЙ:

1. FACT
Новый важный факт.

2. CHARACTER_CHANGE
Изменение состояния персонажа:
характер, знания, способности, положение, цель,
убеждения, отношения и т.д.

3. RELATIONSHIP_CHANGE
Изменение отношений между персонажами.

4. WORLD_CHANGE
Новое состояние мира, локации, организации,
правила мира или другие важные изменения.

5. EVENT
Событие, которое произошло в истории.

6. PLOT_PROGRESS
Продвижение сюжетной линии.

7. SECRET
Новая тайна или изменение существующей тайны.

8. FORESHADOWING
Новая зацепка, обещание или foreshadowing.

9. QUESTION
Вопрос, который остаётся открытым после главы.

10. NEW_ENTITY
Новая сущность, которую система потенциально должна
добавить в Story Bible.

ВАЖНЫЕ ПРАВИЛА:

- Не выдумывай информацию.
- Используй только то, что подтверждается текстом главы.
- Не считай предположение фактом.
- Если информация неоднозначна — ставь safety = "UNCERTAIN".
- Если информация потенциально противоречит существующему
  Canon — ставь safety = "CONFLICT".
- Если информация явно подтверждается текстом и не выглядит
  противоречивой — safety = "SAFE".
- Не изменяй Canon.
- Не удаляй существующие факты.
- Не создавай новые сущности без основания в тексте.
- Не включай обычные мелкие детали, которые не будут полезны
  для будущих глав.
- Выделяй только информацию, которая может быть важна
  для продолжения истории.

Также создай:

shortSummary:
2–3 предложения о том, что произошло в главе.

fullSummary:
более подробное резюме событий главы.

worldDelta:
структурированный список важных изменений состояния мира.

Для каждого найденного изменения укажи:

type
title
content
safety
confidence
reason
`,
          },
          {
            role: "user",
            content: `
PROJECT:
${project.name}

BOOK:
${chapter.book.title}

CHAPTER:
${chapter.number}. ${chapter.title || "Без названия"}

CHAPTER PURPOSE:
${chapter.purpose || "Не указан"}

APPROVED CHAPTER TEXT:
${chapterText}
`,
          },
        ],

        text: {
          format: {
            type: "json_schema",
            name: "memory_extraction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                shortSummary: {
                  type: "string",
                },

                fullSummary: {
                  type: "string",
                },

                worldDelta: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    changes: {
                      type: "array",
                      items: {
                        type: "string",
                      },
                    },
                  },
                  required: ["changes"],
                },

                updates: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      type: {
                        type: "string",
                        enum: [
                          "FACT",
                          "CHARACTER_CHANGE",
                          "RELATIONSHIP_CHANGE",
                          "WORLD_CHANGE",
                          "EVENT",
                          "PLOT_PROGRESS",
                          "SECRET",
                          "FORESHADOWING",
                          "QUESTION",
                          "NEW_ENTITY",
                        ],
                      },

                      title: {
                        type: "string",
                      },

                      content: {
                        type: "string",
                      },

                      safety: {
                        type: "string",
                        enum: [
                          "SAFE",
                          "UNCERTAIN",
                          "CONFLICT",
                        ],
                      },

                      confidence: {
                        type: "number",
                      },

                      reason: {
                        type: "string",
                      },
                    },

                    required: [
                      "type",
                      "title",
                      "content",
                      "safety",
                      "confidence",
                      "reason",
                    ],
                  },
                },
              },

              required: [
                "shortSummary",
                "fullSummary",
                "worldDelta",
                "updates",
              ],
            },
          },
        },
      });

    const outputText =
      response.output_text?.trim();

    if (!outputText) {
      return NextResponse.json(
        {
          error:
            "AI не вернул результат Memory Extraction.",
        },
        {
          status: 500,
        }
      );
    }

    const result = JSON.parse(outputText);

    // =====================================================
    // 8. ОПРЕДЕЛЯЕМ ОБЩУЮ БЕЗОПАСНОСТЬ
    // =====================================================

    const updates = Array.isArray(
      result.updates
    )
      ? result.updates
      : [];

    let safety = "SAFE";

    if (
      updates.some(
        (item: any) =>
          item.safety === "CONFLICT"
      )
    ) {
      safety = "CONFLICT";
    } else if (
      updates.some(
        (item: any) =>
          item.safety === "UNCERTAIN"
      )
    ) {
      safety = "UNCERTAIN";
    }

    const safeCount =
      updates.filter(
        (item: any) =>
          item.safety === "SAFE"
      ).length;

    const uncertainCount =
      updates.filter(
        (item: any) =>
          item.safety === "UNCERTAIN"
      ).length;

    const conflictCount =
      updates.filter(
        (item: any) =>
          item.safety === "CONFLICT"
      ).length;

    // =====================================================
    // 9. AI RUN
    // =====================================================

    const aiRun =
      await prisma.aiRun.create({
        data: {
          userId: session.user.id,
          projectId: projectId,
          roleKey: "MEMORY_EXTRACTION",
          model: "gpt-5.6-luna",
          status: "SUCCESS",
          requestPayload: toInputJson({
            chapterId,
            chapterNumber:
              chapter.number,
          }),
          responsePayload:
            toInputJson(result),
          durationMs:
            Date.now() - startedAt,
        },
      });

    // =====================================================
    // 10. СОЗДАЁМ PROPOSAL
    //
    // AI НЕ ПИШЕТ MEMORY НАПРЯМУЮ.
    // Сначала Proposal.
    // =====================================================

    const proposal =
      await prisma.proposal.create({
        data: {
          projectId: projectId,

          entityType:
            "memory_update",

          entityId: chapter.id,

          op: "CREATE",

          payload: toInputJson({
            chapterId: chapter.id,
            chapterNumber:
              chapter.number,

            shortSummary:
              result.shortSummary,

            fullSummary:
              result.fullSummary,

            worldDelta:
              result.worldDelta,

            updates,

            counts: {
              total: updates.length,
              safe: safeCount,
              uncertain:
                uncertainCount,
              conflicts:
                conflictCount,
            },
          }),

          reason:
            "Извлечение памяти после утверждения главы.",

          confidence:
            updates.length > 0
              ? updates.reduce(
                  (
                    sum: number,
                    item: any
                  ) =>
                    sum +
                    Number(
                      item.confidence ||
                        0
                    ),
                  0
                ) /
                updates.length
              : 1,

          safety,

          aiRunId: aiRun.id,

          sourceChapterId:
            chapter.id,
        },
      });

    // =====================================================
    // 11. ОТВЕТ
    // =====================================================

    return NextResponse.json({
      ok: true,

      proposal: {
        id: proposal.id,
        status: proposal.status,
        safety: proposal.safety,
      },

      summary: {
        shortSummary:
          result.shortSummary,

        total: updates.length,

        safe: safeCount,

        uncertain:
          uncertainCount,

        conflicts:
          conflictCount,
      },

      updates,
    });
  } catch (error) {
    console.error(
      "Memory extraction error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Не удалось выполнить Memory Update.",
      },
      {
        status: 500,
      }
    );
  }
}