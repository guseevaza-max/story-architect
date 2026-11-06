import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import { getOpenAIClient, hasOpenAIKey } from "@/lib/ai/provider";
import { BudgetExceededError, createPrismaTrackingDeps, runTrackedAiCall } from "@/lib/ai/budget";
import { InputTooLargeError, inputEstimate, limitsFor } from "@/lib/ai/limits";
import { prisma as sharedPrisma } from "@/lib/db";

const prisma = new PrismaClient();

export async function POST(
  request: Request,
  context: {
params: Promise<{
      id: string;
      chapterId: string;
    }>;
  }
) {
    if (!hasOpenAIKey()) {
    return NextResponse.json(
      { error: "Провайдер OpenAI не настроен" },
      { status: 500 }
    );
  }

  const openai = getOpenAIClient();

  try {    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован." },
        { status: 401 }
      );
    }

    const {
      id: projectId,
      chapterId,
    } = await context.params;

    const project =
      await prisma.project.findFirst({
        where: {
          id: projectId,
          userId: session.user.id,
        },
      });

    if (!project) {
      return NextResponse.json(
        { error: "Проект не найден." },
        { status: 404 }
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
      });

    if (!chapter) {
      return NextResponse.json(
        { error: "Глава не найдена." },
        { status: 404 }
      );
    }

    if (!chapter.draftText) {
      return NextResponse.json(
        {
          error:
            "В главе пока нет черновика.",
        },
        { status: 400 }
      );
    }

    const report =
      await prisma.continuityReport.findFirst({
        where: {
          chapterId: chapter.id,
          // отчёты проверки плана (level 0) относятся не к тексту
          level: { gt: 0 },
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          issues: true,
        },
      });

    if (!report) {
      return NextResponse.json(
        {
          error:
            "Сначала необходимо выполнить проверку непрерывности.",
        },
        { status: 400 }
      );
    }

    if (report.issues.length === 0) {
      return NextResponse.json(
        {
          error:
            "В отчёте непрерывности нет проблем для исправления.",
        },
        { status: 400 }
      );
    }

    const issues =
      report.issues.map((issue) => ({
        id: issue.id,
        title: issue.title,
        category: issue.category,
        alertType: issue.alertType,
        priority: issue.priority,
        evidence: issue.evidence,
        explanations:
          issue.explanations,
        suggestedResolutions:
          issue.suggestedResolutions,
      }));

    const prompt = `
Ты — редактор художественного текста Story Architect.

Твоя задача — предложить автору несколько способов
исправить найденные проблемы непрерывности.

ВАЖНЫЕ ПРАВИЛА:

1. Не изменяй черновик.
2. Не изменяй Canon.
3. Не придумывай новые факты без необходимости.
4. Для каждой проблемы предложи 2–3 разных варианта.
5. Варианты должны быть практически применимыми к текущему тексту.
6. Сохраняй стиль и логику истории.
7. Автор сам выберет вариант.

ТЕКУЩИЙ ЧЕРНОВИК:

${chapter.draftText}

НАЙДЕННЫЕ ПРОБЛЕМЫ:

${JSON.stringify(
  issues,
  null,
  2
)}

Для каждой проблемы верни:

- issueId
- problemTitle
- suggestions

Каждое предложение должно содержать:

- title
- explanation
- changes — массив конкретных изменений
- excerpt — короткий пример того, как может выглядеть исправленный фрагмент

Верни только JSON.
`;

    // Учёт расходов, месячный лимит и потолки токенов.
    const response = await runTrackedAiCall(
      createPrismaTrackingDeps(sharedPrisma),
      {
        userId: session.user.id,
        projectId: project.id,
        roleKey: "CONTINUITY_SUGGESTIONS",
        provider: "openai",
        model: "gpt-5.6-luna",
        estimate: inputEstimate("CONTINUITY_SUGGESTIONS", prompt),
      },
      async () => {
    const aiResponse =
      await openai.chat.completions.create({
        model: "gpt-5.6-luna",
        max_completion_tokens: limitsFor("CONTINUITY_SUGGESTIONS").maxOutputTokens,

        messages: [
          {
            role: "system",
            content:
              "Ты аккуратный литературный редактор. Только предлагаешь варианты исправления. Никогда не изменяешь Canon или черновик самостоятельно.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],

        response_format: {
          type: "json_schema",

          json_schema: {
            name: "continuity_suggestions",

            strict: true,

            schema: {
              type: "object",

              additionalProperties: false,

              properties: {
                suggestions: {
                  type: "array",

                  items: {
                    type: "object",

                    additionalProperties:
                      false,

                    properties: {
                      issueId: {
                        type: "string",
                      },

                      problemTitle: {
                        type: "string",
                      },

                      suggestions: {
                        type: "array",

                        items: {
                          type: "object",

                          additionalProperties:
                            false,

                          properties: {
                            title: {
                              type: "string",
                            },

                            explanation: {
                              type: "string",
                            },

                            changes: {
                              type: "array",

                              items: {
                                type: "string",
                              },
                            },

                            excerpt: {
                              type: "string",
                            },
                          },

                          required: [
                            "title",
                            "explanation",
                            "changes",
                            "excerpt",
                          ],
                        },
                      },
                    },

                    required: [
                      "issueId",
                      "problemTitle",
                      "suggestions",
                    ],
                  },
                },
              },

              required: [
                "suggestions",
              ],
            },
          },
        },
      });
    return { value: aiResponse, usage: aiResponse.usage };
      }
    );

    const content =
      response.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        {
          error:
            "AI не вернул предложения.",
        },
        { status: 500 }
      );
    }

    let result;

    try {
      result = JSON.parse(content);
    } catch (error) {
      console.error(
        "Ошибка разбора ответа AI:",
        error
      );

      return NextResponse.json(
        {
          error:
            "AI вернул некорректный JSON.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,

      suggestions:
        result.suggestions ?? [],
    });
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return NextResponse.json(
        { error: error.message, code: "BUDGET_EXCEEDED" },
        { status: 429 }
      );
    }
    if (error instanceof InputTooLargeError) {
      return NextResponse.json(
        { error: error.message, code: "INPUT_TOO_LARGE" },
        { status: 413 }
      );
    }
    console.error(
      "Ошибка генерации предложений:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Не удалось получить предложения от AI.",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}