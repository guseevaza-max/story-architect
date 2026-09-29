import { NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { auth } from "@/auth";
import OpenAI from "openai";

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ContinuityIssueFromAI = {
  severity: "HIGH" | "MEDIUM" | "LOW";
  type: string;
  location: string;
  problem: string;
  evidence: string;
  recommendation: string;
};

type ContinuityReportFromAI = {
  status: "PASS" | "WARN" | "FAIL";
  issues: ContinuityIssueFromAI[];
  summary: string;
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
    // =====================================================
    // 1. АВТОРИЗАЦИЯ
    // =====================================================

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const { id: projectId, chapterId } = await params;

    // =====================================================
    // 2. ПРОЕКТ
    // =====================================================

    const project = await prisma.project.findFirst({
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

    const chapter = await prisma.chapter.findFirst({
      where: {
        id: chapterId,
        book: {
          projectId,
        },
      },
      include: {
        book: true,

        scenes: {
          orderBy: {
            order: "asc",
          },
        },
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
    // 4. ПРОВЕРКА ЧЕРНОВИКА
    // =====================================================

    if (!chapter.draftText?.trim()) {
      return NextResponse.json(
        {
          error: "У главы нет черновика для проверки.",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // 5. OPENAI KEY
    // =====================================================

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "OPENAI_API_KEY не настроен.",
        },
        {
          status: 500,
        }
      );
    }

    // =====================================================
    // 6. ПЛАН ГЛАВЫ
    // =====================================================

    const plan =
      chapter.plan &&
      typeof chapter.plan === "object"
        ? JSON.stringify(chapter.plan, null, 2)
        : "План отсутствует.";

    // =====================================================
    // 7. ПЛАН СЦЕН
    // =====================================================

    const scenes = chapter.scenes
      .map((scene) => {
        const scenePlan = Array.isArray(scene.plan)
          ? scene.plan.join("\n")
          : String(scene.plan ?? "");

        return `
Сцена ${scene.order}: ${scene.title}

Назначение:
${scene.purpose ?? ""}

План:
${scenePlan}

Запланированный результат:
${scene.plannedOutcome ?? ""}
`;
      })
      .join("\n");

    // =====================================================
    // 8. SYSTEM PROMPT
    // =====================================================

    const systemPrompt = `
Ты — Continuity Checker в системе Story Architect.

Твоя задача — проверить черновик главы на внутреннюю
непротиворечивость и соответствие утверждённому плану.

Ты НЕ переписываешь текст.

Ты НЕ исправляешь текст самостоятельно.

Ты НЕ изменяешь Canon.

Ты НЕ добавляешь новые факты.

Ты только создаёшь отчёт для автора.

Проверяй:

1. Соответствие утверждённому плану главы.
2. Соответствие плану сцен.
3. Противоречия между сценами.
4. Факты, персонажей, события или способности,
   которые появились без основания.
5. Нарушение запретов и ограничений плана.
6. Логические противоречия внутри текста.
7. Нарушение последовательности событий.
8. Несоответствие действий персонажей их текущему состоянию.
9. Преждевременное раскрытие неизвестной информации.
10. Другие существенные проблемы непрерывности.

Также проверяй:

- Timeline
- World
- Abilities
- Relationships
- Secrets
- Plot
- Knowledge
- Dead/alive
- Location
- Possessions

Не считай обычные стилистические предпочтения ошибками.

Не придумывай проблему, если для неё нет достаточных оснований.

Каждая проблема должна содержать:

severity
type
location
problem
evidence
recommendation

severity:

HIGH — существенная проблема.

MEDIUM — проблема, которую желательно проверить или исправить.

LOW — небольшая проблема или потенциальный вопрос.

Если проблем нет — верни пустой массив issues.

Верни ТОЛЬКО JSON:

{
  "status": "PASS" | "WARN" | "FAIL",
  "issues": [
    {
      "severity": "HIGH" | "MEDIUM" | "LOW",
      "type": "string",
      "location": "string",
      "problem": "string",
      "evidence": "string",
      "recommendation": "string"
    }
  ],
  "summary": "string"
}

PASS:
существенных проблем не найдено.

WARN:
есть небольшие или требующие внимания проблемы.

FAIL:
есть существенные противоречия или нарушения.
`;

    // =====================================================
    // 9. USER PROMPT
    // =====================================================

    const userPrompt = `
ПРОЕКТ:
${project.name}

ГЛАВА:
${chapter.number}. ${chapter.title}

ЦЕЛЬ ГЛАВЫ:
${chapter.purpose ?? ""}

АВТОРСКАЯ ИДЕЯ:
${chapter.authorIdea ?? ""}

УТВЕРЖДЁННЫЙ ПЛАН ГЛАВЫ:
${plan}

УТВЕРЖДЁННЫЙ ПЛАН СЦЕН:
${scenes || "План сцен отсутствует."}

ЧЕРНОВИК ГЛАВЫ:
${chapter.draftText}
`;

    // =====================================================
    // 10. OPENAI
    // =====================================================

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",

      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],

      text: {
        format: {
          type: "json_schema",
          name: "continuity_report",
          strict: true,

          schema: {
            type: "object",

            additionalProperties: false,

            properties: {
              status: {
                type: "string",

                enum: [
                  "PASS",
                  "WARN",
                  "FAIL",
                ],
              },

              issues: {
                type: "array",

                items: {
                  type: "object",

                  additionalProperties: false,

                  properties: {
                    severity: {
                      type: "string",

                      enum: [
                        "HIGH",
                        "MEDIUM",
                        "LOW",
                      ],
                    },

                    type: {
                      type: "string",
                    },

                    location: {
                      type: "string",
                    },

                    problem: {
                      type: "string",
                    },

                    evidence: {
                      type: "string",
                    },

                    recommendation: {
                      type: "string",
                    },
                  },

                  required: [
                    "severity",
                    "type",
                    "location",
                    "problem",
                    "evidence",
                    "recommendation",
                  ],
                },
              },

              summary: {
                type: "string",
              },
            },

            required: [
              "status",
              "issues",
              "summary",
            ],
          },
        },
      },
    });

    // =====================================================
    // 11. ПОЛУЧАЕМ AI OUTPUT
    // =====================================================

    const output = response.output_text?.trim();

    if (!output) {
      return NextResponse.json(
        {
          error: "AI не вернул отчёт проверки.",
        },
        {
          status: 500,
        }
      );
    }

    // =====================================================
    // 12. PARSE JSON
    // =====================================================

    let report: ContinuityReportFromAI;

    try {
      report = JSON.parse(output);
    } catch (error) {
      console.error(
        "Continuity JSON parse error:",
        error
      );

      return NextResponse.json(
        {
          error: "AI вернул некорректный JSON отчёта.",
        },
        {
          status: 500,
        }
      );
    }

    // =====================================================
    // 13. СОЗДАЁМ CONTINUITY REPORT
    // =====================================================

    let savedReport;

    try {
      savedReport =
        await prisma.continuityReport.create({
          data: {
            chapterId: chapter.id,

            // 2 = семантическая AI-проверка
            level: 2,

            summary:
              report.summary as Prisma.InputJsonValue,

            issues: {
              create: report.issues.map(
                (issue) => {
                  let alertType:
                    | "ERROR"
                    | "WARNING"
                    | "OPPORTUNITY";

                  if (
                    issue.severity === "HIGH"
                  ) {
                    alertType = "ERROR";
                  } else if (
                    issue.severity === "MEDIUM"
                  ) {
                    alertType = "WARNING";
                  } else {
                    alertType = "WARNING";
                  }

                  let priority:
                    | "CRITICAL"
                    | "IMPORTANT"
                    | "USEFUL"
                    | "OPTIONAL";

                  if (
                    issue.severity === "HIGH"
                  ) {
                    priority = "CRITICAL";
                  } else if (
                    issue.severity === "MEDIUM"
                  ) {
                    priority = "IMPORTANT";
                  } else {
                    priority = "USEFUL";
                  }

                  return {
                    alertType,

                    priority,

                    category:
                      issue.type,

                    title:
                      issue.problem,

                    evidence:
                      issue.evidence as Prisma.InputJsonValue,

                    explanations:
                      {
                        recommendation:
                          issue.recommendation,

                        location:
                          issue.location,
                      } as Prisma.InputJsonValue,

                    confidence: null,

                    suggestedResolutions:
                      {
                        recommendation:
                          issue.recommendation,
                      } as Prisma.InputJsonValue,

                    resolved: false,

                    resolution: null,
                  };
                }
              ),
            },
          },

          include: {
            issues: true,
          },
        });
    } catch (error) {
      console.error(
        "Continuity report DB save error:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return NextResponse.json(
        {
          error:
            "AI проверку выполнил, но сохранить отчёт в базу не удалось.",

          details: message,
        },
        {
          status: 500,
        }
      );
    }

    // =====================================================
    // 14. МЕНЯЕМ СТАТУС ГЛАВЫ
    // =====================================================

    try {
      await prisma.chapter.update({
        where: {
          id: chapter.id,
        },

        data: {
          status: "CHECKING",
        },
      });
    } catch (error) {
      console.error(
        "Chapter status update error:",
        error
      );

      // Сам отчёт уже сохранён.
      // Поэтому не считаем всю операцию провальной.
    }

    // =====================================================
    // 15. ОТВЕТ
    // =====================================================

    return NextResponse.json({
      ok: true,

      report: {
        id: savedReport.id,

        status:
          report.status,

        summary:
          report.summary,

        issues:
          savedReport.issues,
      },
    });
  } catch (error) {
    console.error(
      "Continuity check error:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    return NextResponse.json(
      {
        error:
          "Не удалось выполнить проверку непрерывности.",

        details: message,
      },
      {
        status: 500,
      }
    );
  }
}