import { NextResponse } from "next/server";
import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Selection = {
  issueId: string;
  problemTitle: string;
  suggestion: {
    title: string;
    explanation: string;
    changes: string[];
    excerpt: string;
  };
};

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
      return NextResponse.json(
        {
          error: "Не авторизован",
        },
        {
          status: 401,
        }
      );
    }

    const {
      id,
      chapterId,
    } = await params;

    const body =
      await request.json();

    const selections =
      body?.selections as
        | Selection[]
        | undefined;

    if (
      !Array.isArray(
        selections
      ) ||
      selections.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Не выбрано ни одного исправления.",
        },
        {
          status: 400,
        }
      );
    }

    const project =
      await prisma.project.findFirst({
        where: {
          id,
          userId: session.user.id,
        },
        select: {
          id: true,
          name: true,
        },
      });

    if (!project) {
      return NextResponse.json(
        {
          error: "Проект не найден",
        },
        {
          status: 404,
        }
      );
    }

    const chapter =
      await prisma.chapter.findFirst({
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
        {
          error: "Глава не найдена",
        },
        {
          status: 404,
        }
      );
    }

    if (
      !chapter.draftText?.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "У главы нет черновика.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !process.env.OPENAI_API_KEY
    ) {
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

    const cleanSelections =
      selections.map(
        (item) => ({
          issueId: String(
            item.issueId || ""
          ),

          problemTitle: String(
            item.problemTitle || ""
          ),

          suggestion: {
            title: String(
              item.suggestion?.title ||
                ""
            ),

            explanation: String(
              item.suggestion
                ?.explanation || ""
            ),

            changes:
              Array.isArray(
                item.suggestion
                  ?.changes
              )
                ? item.suggestion.changes.map(
                    String
                  )
                : [],

            excerpt: String(
              item.suggestion
                ?.excerpt || ""
            ),
          },
        })
      );

    const prompt = `
Ты — литературный редактор Story Architect.

Твоя задача — ОДНИМ проходом подготовить
исправленный вариант всего текущего черновика.

Автор уже выбрал конкретные исправления
для нескольких проблем непрерывности.

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:

1. Исправь все выбранные проблемы за ОДИН проход.
2. Не исправляй проблемы, которые не указаны автором.
3. Не добавляй новые сюжетные события без необходимости.
4. Не меняй Canon.
5. Не меняй смысл истории без необходимости.
6. Сохрани стиль автора.
7. Сохрани структуру главы.
8. Сохрани персонажей, события и локации.
9. Не удаляй важные фрагменты текста.
10. Не переписывай главу полностью ради небольших исправлений.
11. Если несколько исправлений затрагивают один и тот же
    фрагмент, объедини их аккуратно.
12. Если два выбранных исправления конфликтуют,
    выбери наиболее буквальное выполнение указаний автора
    и укажи это в changeSummary.
13. Верни ПОЛНЫЙ обновлённый текст главы.
14. Не добавляй никаких комментариев внутрь художественного текста.

=====================================================
ПРОЕКТ
=====================================================

${project.name}

=====================================================
КНИГА
=====================================================

${chapter.book.title}

=====================================================
ГЛАВА
=====================================================

${chapter.number}. ${
      chapter.title ||
      "Без названия"
    }

=====================================================
ВЫБРАННЫЕ АВТОРОМ ИСПРАВЛЕНИЯ
=====================================================

${JSON.stringify(
  cleanSelections,
  null,
  2
)}

=====================================================
ТЕКУЩИЙ ЧЕРНОВИК
=====================================================

${chapter.draftText}

=====================================================

Подготовь один единый исправленный черновик.

Не сохраняй его в базу.
Просто верни результат для предпросмотра автору.
`;

    const response =
      await openai.chat.completions.create({
        model: "gpt-5.6-luna",

        messages: [
          {
            role: "system",
            content:
              "Ты аккуратный литературный редактор. Исправляй только выбранные автором проблемы и сохраняй остальной текст.",
          },

          {
            role: "user",
            content: prompt,
          },
        ],

        response_format: {
          type: "json_schema",

          json_schema: {
            name:
              "combined_chapter_revision",

            strict: true,

            schema: {
              type: "object",

              additionalProperties:
                false,

              properties: {
                revisedDraft: {
                  type: "string",
                },

                changeSummary: {
                  type: "string",
                },
              },

              required: [
                "revisedDraft",
                "changeSummary",
              ],
            },
          },
        },
      });

    const content =
      response.choices[0]?.message
        ?.content;

    if (!content) {
      return NextResponse.json(
        {
          error:
            "AI не вернул исправленный черновик.",
        },
        {
          status: 500,
        }
      );
    }

    let result: {
      revisedDraft: string;
      changeSummary: string;
    };

    try {
      result = JSON.parse(
        content
      );
    } catch (error) {
      console.error(
        "Combined revision JSON parse error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "AI вернул некорректный JSON.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !result.revisedDraft?.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "AI не вернул исправленный текст.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,

      revisedDraft:
        result.revisedDraft,

      changeSummary:
        result.changeSummary,

      appliedCount:
        cleanSelections.length,
    });
  } catch (error) {
    console.error(
      "Combined continuity revision error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Не удалось подготовить общее исправление.",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}