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
      return NextResponse.json(
        { error: "Unauthorized" },
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

    if (!chapter.plan || !chapter.planApproved) {
      return NextResponse.json(
        {
          error:
            "Сначала необходимо утвердить план главы.",
        },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "OPENAI_API_KEY не настроен.",
        },
        { status: 500 }
      );
    }

    const chapterPlan = chapter.plan;

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",

      input: [
        {
          role: "system",
          content: `
Ты — Scene Planner в системе Story Architect.

Твоя задача — превратить УТВЕРЖДЁННЫЙ план главы в последовательность сцен.

ВАЖНЫЕ ПРАВИЛА:

1. Автор является главным принимающим решения.
2. Не изменяй Canon.
3. Не придумывай новые важные факты, персонажей, способности,
   предметы, фракции или события, которых нет в плане.
4. Не пиши художественный текст.
5. Не превращай план в готовую главу.
6. Каждая сцена должна иметь понятную драматическую функцию.
7. Сцены должны вместе вести от начального состояния главы
   к конечному состоянию.
8. MUST HAPPEN необходимо распределить по сценам.
9. MUST NOT HAPPEN нельзя включать в сцены.
10. Если информации недостаточно, не выдумывай её.
11. Если конкретная деталь неизвестна, оставь её неопределённой
    или укажи вопрос в openQuestions.
12. Scene Plan — это предложение для автора, а не Canon.

Обычно используй от 3 до 8 сцен.
Количество сцен выбирай по сложности главы.

Для каждой сцены определи:
- порядок;
- название;
- цель сцены;
- краткий план действий;
- ожидаемый результат сцены.

Не пиши диалоги и художественную прозу.
`,
        },
        {
          role: "user",
          content: `
Проект: ${project.name}

Книга:
${chapter.book.title || `Книга ${chapter.book.number}`}

Глава:
${chapter.title || `Глава ${chapter.number}`}

Идея автора:
${chapter.authorIdea || "Не указана"}

Утверждённый план главы:

${JSON.stringify(chapterPlan, null, 2)}

Создай Scene Plan.
`,
        },
      ],

      text: {
        format: {
          type: "json_schema",
          name: "scene_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,

            properties: {
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,

                  properties: {
                    order: {
                      type: "integer",
                    },

                    title: {
                      type: "string",
                    },

                    purpose: {
                      type: "string",
                    },

                    plan: {
                      type: "array",
                      items: {
                        type: "string",
                      },
                    },

                    plannedOutcome: {
                      type: "string",
                    },
                  },

                  required: [
                    "order",
                    "title",
                    "purpose",
                    "plan",
                    "plannedOutcome",
                  ],
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
              "scenes",
              "openQuestions",
            ],
          },
        },
      },
    });

    const outputText = response.output_text;

    if (!outputText) {
      return NextResponse.json(
        {
          error: "AI не вернул план сцен.",
        },
        { status: 500 }
      );
    }

    const scenePlan = JSON.parse(outputText);

    console.log("SCENE PLANNER: AI PLAN CREATED", {
      projectId: project.id,
      chapterId: chapter.id,
      scenesCount: scenePlan.scenes?.length ?? 0,
    });

    /*
     * Scene Plan — это Proposal.
     * Он НЕ становится Canon автоматически.
     * Автор должен сначала проверить и утвердить его.
     */
    const proposal = await prisma.proposal.create({
      data: {
        projectId: project.id,
        entityType: "scene_plan",
        op: "CREATE",

        payload: scenePlan,

        reason:
          "Scene Planner сформировал предварительный план сцен на основе утверждённого плана главы.",

        confidence: 0.8,
        safety: "UNCERTAIN",
        status: "PENDING",

        sourceChapterId: chapter.id,
      },
    });

    console.log("SCENE PROPOSAL CREATED", {
      proposalId: proposal.id,
      entityType: proposal.entityType,
      status: proposal.status,
      sourceChapterId: proposal.sourceChapterId,
    });

    return NextResponse.json({
      ok: true,
      chapterId: chapter.id,
      scenePlan,
      proposalId: proposal.id,
    });
  } catch (error) {
    console.error("Scene Planner error:", error);

    return NextResponse.json(
      {
        error: "Не удалось создать план сцен.",
      },
      { status: 500 }
    );
  }
}