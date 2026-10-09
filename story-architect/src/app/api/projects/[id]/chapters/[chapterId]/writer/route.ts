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
        scenes: {
          orderBy: {
            order: "asc",
          },
        },
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

    if (!chapter.scenes || chapter.scenes.length === 0) {
      return NextResponse.json(
        {
          error:
            "Сначала необходимо сформировать план сцен.",
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

    /*
     * ---------------------------------------------------------
     * CONTEXT RETRIEVAL
     * ---------------------------------------------------------
     *
     * Writer получает:
     *
     * 1. Canon Facts
     * 2. Previous Canon Chapter
     * 3. Long-term Memory
     * 4. Characters
     * 5. Character States
     * 6. Relationships
     *
     * Затем:
     * 7. Chapter Plan
     * 8. Scene Plan
     */

    const [
      canonFacts,
      previousChapter,
      memoryChunks,
      characters,
      relationships,
    ] = await Promise.all([
      /*
       * -------------------------------------------------------
       * CANON FACTS
       * -------------------------------------------------------
       */

      prisma.canonFact.findMany({
        where: {
          projectId: project.id,
          status: "CANON",

          OR: [
            {
              validFromChapter: null,
            },
            {
              validFromChapter: {
                lte: chapter.number,
              },
            },
          ],

          AND: [
            {
              OR: [
                {
                  validToChapter: null,
                },
                {
                  validToChapter: {
                    gte: chapter.number,
                  },
                },
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

        orderBy: [
          {
            importance: "desc",
          },
          {
            createdAt: "desc",
          },
        ],

        take: 100,
      }),

      /*
       * -------------------------------------------------------
       * PREVIOUS CANON CHAPTER
       * -------------------------------------------------------
       */

      prisma.chapter.findFirst({
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
      }),

      /*
       * -------------------------------------------------------
       * LONG-TERM MEMORY
       * -------------------------------------------------------
       */

      prisma.memoryChunk.findMany({
        where: {
          projectId: project.id,

          OR: [
            {
              chapterId: null,
            },
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
        },

        orderBy: {
          createdAt: "desc",
        },

        take: 30,
      }),

      /*
       * -------------------------------------------------------
       * CHARACTERS
       * -------------------------------------------------------
       *
       * Берём только Canon-персонажей.
       *
       * Writer не должен получать Proposal/Draft персонажей
       * как установленную реальность.
       */

      prisma.character.findMany({
        where: {
          projectId: project.id,
          status: "CANON",
        },

        select: {
          id: true,
          name: true,
          role: true,
          tier: true,
          description: true,
          appearance: true,
          history: true,
          personality: true,
          goals: true,
          fears: true,
          beliefs: true,
          values: true,
          abilities: true,

          voice: {
            select: {
              vocabulary: true,
              sentenceLength: true,
              speechRhythm: true,
              formality: true,
              humor: true,
              emotionalExplicit: true,
              typicalExpressions: true,
              forbiddenExpressions: true,
              communicationStyle: true,
              status: true,
            },
          },

          states: {
            where: {
              status: "CANON",

              OR: [
                {
                  chapterId: null,
                },
                {
                  chapter: {
                    number: {
                      lte: chapter.number,
                    },
                    bookId: chapter.bookId,
                  },
                },
              ],
            },

            orderBy: {
              createdAt: "desc",
            },

            select: {
              attribute: true,
              oldValue: true,
              newValue: true,
              reason: true,
              chapterId: true,
              status: true,
            },
          },
        },

        orderBy: [
          {
            tier: "asc",
          },
          {
            name: "asc",
          },
        ],
      }),

      /*
       * -------------------------------------------------------
       * RELATIONSHIPS
       * -------------------------------------------------------
       *
       * Берём отношения, действующие на текущую главу.
       */

      prisma.relationship.findMany({
        where: {
          projectId: project.id,
          status: "CANON",

          AND: [
            {
              OR: [
                {
                  validFromChapter: null,
                },
                {
                  validFromChapter: {
                    lte: chapter.number,
                  },
                },
              ],
            },
            {
              OR: [
                {
                  validToChapter: null,
                },
                {
                  validToChapter: {
                    gte: chapter.number,
                  },
                },
              ],
            },
          ],
        },

        select: {
          sourceId: true,
          targetId: true,
          relationType: true,
          value: true,
          reason: true,
          validFromChapter: true,
          validToChapter: true,
        },

        orderBy: {
          createdAt: "desc",
        },

        take: 100,
      }),
    ]);

    /*
     * ---------------------------------------------------------
     * FORMAT CANON
     * ---------------------------------------------------------
     */

    const canonContext = canonFacts.length
      ? canonFacts
          .map(
            (fact, index) =>
              `${index + 1}. ${
                fact.negation ? "НЕ " : ""
              }${fact.statement}`
          )
          .join("\n")
      : "Подтверждённых Canon Facts пока нет.";

    /*
     * ---------------------------------------------------------
     * FORMAT PREVIOUS CHAPTER
     * ---------------------------------------------------------
     */

    const previousChapterSummary =
      previousChapter?.chapterSummary
        ? `Глава ${previousChapter.number}: ${
            previousChapter.title || "Без названия"
          }\n${
            previousChapter.chapterSummary.shortSummary
          }\n${
            previousChapter.chapterSummary.fullSummary ||
            ""
          }`
        : "Предыдущего сохранённого резюме нет.";

    /*
     * ---------------------------------------------------------
     * FORMAT MEMORY
     * ---------------------------------------------------------
     */

    const memoryContext = memoryChunks.length
      ? memoryChunks
          .map(
            (chunk, index) =>
              `${index + 1}. [${chunk.kind}] ${chunk.content}`
          )
          .join("\n\n")
      : "Сохранённой долгосрочной памяти пока нет.";

    /*
     * ---------------------------------------------------------
     * FORMAT CHARACTERS
     * ---------------------------------------------------------
     */

    const charactersContext = characters.length
      ? characters
          .map((character, index) => {
            const states = character.states.length
              ? character.states
                  .map(
                    (state) =>
                      `- ${state.attribute}: ${JSON.stringify(
                        state.newValue
                      )}${
                        state.reason
                          ? ` — причина: ${state.reason}`
                          : ""
                      }`
                  )
                  .join("\n")
              : "- Актуального CharacterState нет.";

            const voice = character.voice
              ? [
                  character.voice.vocabulary &&
                    `Vocabulary: ${character.voice.vocabulary}`,
                  character.voice.sentenceLength &&
                    `Sentence length: ${character.voice.sentenceLength}`,
                  character.voice.speechRhythm &&
                    `Speech rhythm: ${character.voice.speechRhythm}`,
                  character.voice.formality &&
                    `Formality: ${character.voice.formality}`,
                  character.voice.humor &&
                    `Humor: ${character.voice.humor}`,
                  character.voice.emotionalExplicit &&
                    `Emotional explicitness: ${character.voice.emotionalExplicit}`,
                  character.voice.communicationStyle &&
                    `Communication style: ${character.voice.communicationStyle}`,
                ]
                  .filter(Boolean)
                  .join("; ")
              : "";

            return `
${index + 1}. ${character.name}
Role: ${character.role || "Не указана"}
Tier: ${character.tier}

Description:
${character.description || "Не указано"}

Appearance:
${character.appearance || "Не указано"}

History:
${character.history || "Не указана"}

Personality:
${character.personality || "Не указана"}

Goals:
${character.goals || "Не указаны"}

Fears:
${character.fears || "Не указаны"}

Beliefs:
${character.beliefs || "Не указаны"}

Values:
${character.values || "Не указаны"}

Abilities:
${character.abilities
  ? JSON.stringify(character.abilities)
  : "Не указаны"}

Current character states:
${states}

Voice:
${voice || "Отдельный профиль голоса не задан."}
`;
          })
          .join("\n--------------------\n")
      : "Канонических персонажей пока нет.";

    /*
     * ---------------------------------------------------------
     * FORMAT RELATIONSHIPS
     * ---------------------------------------------------------
     *
     * Здесь используем ID, чтобы не делать второй запрос.
     * После этого Writer получает понятное имя персонажа.
     */

    const characterNames = new Map(
      characters.map((character) => [
        character.id,
        character.name,
      ])
    );

    const relationshipsContext = relationships.length
      ? relationships
          .map((relationship, index) => {
            const sourceName =
              characterNames.get(relationship.sourceId) ||
              relationship.sourceId;

            const targetName =
              characterNames.get(relationship.targetId) ||
              relationship.targetId;

            return `${index + 1}. ${sourceName} → ${targetName}
Тип отношений: ${relationship.relationType}
Значение: ${
              relationship.value !== null &&
              relationship.value !== undefined
                ? relationship.value
                : "не задано"
            }
Причина: ${
              relationship.reason || "не указана"
            }`;
          })
          .join("\n\n")
      : "Канонических отношений между персонажами пока нет.";

    /*
     * ---------------------------------------------------------
     * FORMAT SCENES
     * ---------------------------------------------------------
     */

    const scenes = chapter.scenes.map((scene) => ({
      order: scene.order,
      title: scene.title,
      purpose: scene.purpose,
      plan: scene.plan,
      plannedOutcome: scene.plannedOutcome,
    }));

    /*
     * ---------------------------------------------------------
     * OPENAI
     * ---------------------------------------------------------
     */

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",

      input: [
        {
          role: "system",

          content: `
Ты — AI Writer в системе Story Architect.

Твоя задача — написать художественный ЧЕРНОВИК главы
на основе утверждённого плана главы, утверждённого плана сцен
и подтверждённого контекста Story Bible.

Ты не являешься владельцем Canon.
Ты не можешь изменять Canon.
Ты не можешь самостоятельно создавать новые канонические факты.

ПРИОРИТЕТ ИСТОЧНИКОВ:

1. Подтверждённый Canon.
2. Актуальные состояния персонажей.
3. Утверждённый план главы.
4. Утверждённый план сцен.
5. Подтверждённые персонажи и их характеристики.
6. Подтверждённые отношения между персонажами.
7. Правила мира и другие подтверждённые ограничения.
8. Идея автора.
9. Предыдущая глава и Memory как исторический контекст.

ПРАВИЛА CANON:

- Никогда не нарушай подтверждённый Canon.
- Если творческая идея конфликтует с Canon, Canon всегда побеждает.
- Не превращай предположение в факт.
- Не превращай Memory в новый Canon.
- Не превращай открытый вопрос в установленную истину.
- Не придумывай крупные события, которых нет в плане.
- Не придумывай новые важные способности, фракции, организации или правила мира без основания в контексте.
- Не раскрывай тайны, если контекст не даёт основания считать, что они уже известны персонажу.
- Не давай персонажу знания, которых у него нет.
- Не меняй установленные состояния персонажей без события, которое это изменение объясняет.

ПРАВИЛА ПЕРСОНАЖЕЙ:

- Используй характеристики персонажей как основу их поведения.
- Учитывай их текущие CharacterState.
- Учитывай их цели, страхи, убеждения и ценности.
- Учитывай отношения между персонажами.
- Не меняй характер персонажа только ради удобства сцены.
- Не заставляй персонажа знать то, чего он не знает.
- Не заставляй персонажа действовать вопреки установленным отношениям без причины внутри сцены.

ПРАВИЛА ПЛАНА:

- Не меняй порядок сцен.
- Не удаляй смысл утверждённых сцен.
- Не превращай plannedOutcome в гарантированный факт, если сцена должна оставить результат неопределённым.
- Художественно развивай сцену, но не меняй её функциональное назначение.
- Связывай сцены естественными переходами.
- Не добавляй крупные сюжетные линии, которых нет в утверждённом плане.

ПРАВИЛА MEMORY:

- Memory — это контекст, а не новый Canon.
- Если Memory конфликтует с подтверждённым Canon, побеждает Canon.
- Если Memory содержит неопределённость, сохраняй неопределённость.
- Не превращай внутренние предположения автора или AI в факт.

РЕЗУЛЬТАТ:

Верни только художественный текст главы.

Не добавляй:
- комментарии;
- объяснения;
- заголовки вроде "Вот черновик";
- анализ;
- JSON;
- служебные пометки.

Пиши как полноценную художественную главу.
`,
        },

        {
          role: "user",

          content: `
ПРОЕКТ:
${project.name}

КНИГА:
${chapter.book.title || `Книга ${chapter.book.number}`}

ГЛАВА:
${chapter.title || `Глава ${chapter.number}`}

ЦЕЛЬ ГЛАВЫ:
${chapter.purpose || "Не указана"}

ИДЕЯ АВТОРА:
${chapter.authorIdea || "Не указана"}

==================================================
CANON FACTS
==================================================

${canonContext}

==================================================
ПЕРСОНАЖИ
==================================================

${charactersContext}

==================================================
ОТНОШЕНИЯ МЕЖДУ ПЕРСОНАЖАМИ
==================================================

${relationshipsContext}

==================================================
ПРЕДЫДУЩАЯ CANON-ГЛАВА
==================================================

${previousChapterSummary}

==================================================
LONG-TERM MEMORY
==================================================

${memoryContext}

==================================================
УТВЕРЖДЁННЫЙ ПЛАН ГЛАВЫ
==================================================

${JSON.stringify(chapter.plan, null, 2)}

==================================================
УТВЕРЖДЁННЫЙ ПЛАН СЦЕН
==================================================

${JSON.stringify(scenes, null, 2)}

==================================================

Напиши художественный черновик главы.

Сохрани причинно-следственную связь,
состояние персонажей,
их отношения,
ограничения Canon
и функциональное назначение каждой утверждённой сцены.

Верни только текст главы.
`,
        },
      ],

      text: {
        format: {
          type: "text",
        },
      },
    });

    const draftText = response.output_text?.trim();

    if (!draftText) {
      return NextResponse.json(
        {
          error: "AI не вернул текст черновика.",
        },
        { status: 500 }
      );
    }

    const wordCount = draftText
      .split(/\s+/)
      .filter(Boolean)
      .length;

    /*
     * ---------------------------------------------------------
     * SAVE DRAFT
     * ---------------------------------------------------------
     *
     * ВАЖНО:
     * Writer меняет только draftText.
     * Canon здесь НЕ изменяется.
     */

    const updatedChapter =
      await prisma.chapter.update({
        where: {
          id: chapter.id,
        },

        data: {
          draftText,
          wordCount,
          status: "DRAFT",
        },
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
      {
        error:
          "Не удалось создать черновик главы.",
      },
      { status: 500 }
    );
  }
}