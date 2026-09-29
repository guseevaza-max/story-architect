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
          error: "Сначала необходимо утвердить план главы.",
        },
        { status: 400 }
      );
    }

    if (!chapter.scenes || chapter.scenes.length === 0) {
      return NextResponse.json(
        {
          error: "Сначала необходимо сформировать план сцен.",
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

Твоя задача — написать ЧЕРНОВИК главы на основе утверждённого
плана главы и утверждённой структуры сцен.

Автор является главным принимающим решения.

ПРИОРИТЕТ ИСТОЧНИКОВ:

1. Утверждённый план главы.
2. Утверждённый план сцен.
3. Идея автора.

ВАЖНЫЕ ПРАВИЛА:

1. Пиши художественный черновик главы.
2. Следуй последовательности сцен.
3. Не пропускай обязательные события.
4. Не нарушай ограничения из раздела "Не должно произойти".
5. Не придумывай новые важные факты мира.
6. Не придумывай новые фракции.
7. Не придумывай новые важные способности.
8. Не придумывай крупные события, которых нет в плане.
9. Не раскрывай тайны, которые автор оставил неизвестными.
10. Не превращай открытые вопросы в установленные факты.
11. Если конкретная деталь неизвестна, оставь её неопределённой.
12. Не меняй порядок сцен.
13. Не меняй смысл утверждённого плана.
14. Не завершай конфликт раньше времени.
15. Не превращай черновик в окончательный Canon.
16. Не добавляй комментарии автора или объяснения работы AI.
17. Не пиши "согласно плану", "автор должен", "AI решил" и подобные фразы.
18. Не пиши анализ вместо художественного текста.

Текст должен ощущаться как настоящая глава книги,
а не как пересказ плана.

Каждая сцена должна естественно продолжать предыдущую.
Действия персонажей должны иметь причинно-следственную связь.

Если план оставляет вопрос открытым,
не выдумывай окончательный ответ на этот вопрос.

Напиши полноценный художественный черновик главы.

Верни только текст главы.
`,
        },

        {
          role: "user",
          content: `
Проект:
${project.name}

Книга:
${chapter.book.title || `Книга ${chapter.book.number}`}

Глава:
${chapter.title || `Глава ${chapter.number}`}

Идея автора:
${chapter.authorIdea || "Не указана"}

УТВЕРЖДЁННЫЙ ПЛАН ГЛАВЫ:

${JSON.stringify(chapter.plan, null, 2)}

УТВЕРЖДЁННЫЙ ПЛАН СЦЕН:

${JSON.stringify(scenes, null, 2)}

Теперь напиши художественный черновик этой главы.

Не добавляй заголовок главы.
Не добавляй пояснения.
Не добавляй комментарии.
Верни только текст художественного черновика.
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
      .filter(Boolean).length;

    const updatedChapter = await prisma.chapter.update({
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
        error: "Не удалось создать черновик главы.",
      },
      { status: 500 }
    );
  }
}