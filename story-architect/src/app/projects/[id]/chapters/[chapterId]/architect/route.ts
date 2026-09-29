import { NextResponse } from "next/server";
import OpenAI from "openai";
import { PrismaClient, AiRunStatus, ProposalOp } from "@prisma/client";
import { auth } from "@/auth";

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

Верни только JSON согласно заданной схеме.

Нужно определить:

1. chapterPurpose
Что эта глава должна сделать в истории.

2. initialState
В каком состоянии история и персонажи находятся
в начале главы.

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

8. openQuestions
Что осталось неопределённым и требует решения автора.

Если информации недостаточно — укажи это явно.
Не выдумывай недостающие факты.
`;

    const userPrompt = `
PROJECT:
${project.name}

BOOK:
${chapter.book.title}

CHAPTER:
${chapter.number}. ${chapter.title || "Без названия"}

CHAPTER PURPOSE:
${chapter.purpose || "Не указано"}

AUTHOR IDEA:
${chapter.authorIdea}

Проанализируй эту идею как Architect.
Не пиши саму главу.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      temperature: 0.2,
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

    const rawContent = response.choices[0]?.message?.content;

    if (!rawContent) {
      throw new Error("AI не вернул результат");
    }

    const plan = JSON.parse(rawContent);

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
        },
        responsePayload: plan,
        durationMs,
        status: AiRunStatus.SUCCESS,
      },
    });

    const proposal = await prisma.proposal.create({
      data: {
        projectId: project.id,
        entityType: "chapter_plan",
        entityId: chapter.id,
        op: ProposalOp.UPDATE,
        payload: plan,
        reason:
          "Architect сформировал предложение плана главы на основе идеи автора.",
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