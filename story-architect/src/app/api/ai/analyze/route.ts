
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOpenAIClient } from "@/lib/ai/provider";
import { BudgetExceededError, createPrismaTrackingDeps, runTrackedAiCall } from "@/lib/ai/budget";
import { InputTooLargeError, inputEstimate, limitsFor } from "@/lib/ai/limits";
import { prisma } from "@/lib/db";

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    facts: {
      type: "array",
      items: { type: "string" },
    },
    characters: {
      type: "array",
      items: { type: "string" },
    },
    locations: {
      type: "array",
      items: { type: "string" },
    },
    factions: {
      type: "array",
      items: { type: "string" },
    },
    worldRules: {
      type: "array",
      items: { type: "string" },
    },
    events: {
      type: "array",
      items: { type: "string" },
    },
    relationships: {
      type: "array",
      items: { type: "string" },
    },
    secrets: {
      type: "array",
      items: { type: "string" },
    },
    plotLines: {
      type: "array",
      items: { type: "string" },
    },
    openQuestions: {
      type: "array",
      items: { type: "string" },
    },
    // Структурированные кандидаты для предложений автору.
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: {
            type: "string",
            enum: [
              "character",
              "unnamed_figure",
              "location",
              "faction",
              "state_or_realm",
              "government_body",
              "abstract_concept",
              "world_rule",
              "event",
              "plot_line",
              "consequence_or_fact",
              "other",
            ],
          },
          name: { type: "string" },
          description: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "number" },
          isOngoing: { type: "boolean" },
          eventGroup: { type: "string" },
          cause: { type: "string" },
          consequences: { type: "string" },
          inWorldDate: { type: "string" },
        },
        required: [
          "kind",
          "name",
          "description",
          "evidence",
          "confidence",
          "isOngoing",
          "eventGroup",
          "cause",
          "consequences",
          "inWorldDate",
        ],
      },
    },
  },
  required: [
    "facts",
    "characters",
    "locations",
    "factions",
    "worldRules",
    "events",
    "relationships",
    "secrets",
    "plotLines",
    "openQuestions",
    "candidates",
  ],
};

const ANALYSIS_SYSTEM_PROMPT = `Ты AI-архитектор Story Architect. Извлекай из текста только информацию, которая прямо указана или однозначно следует из текста. Не выдумывай факты. Если категория не представлена, верни пустой массив. Не превращай предположения в факты.

Помимо списков по категориям заполни массив candidates: каждая запись — один объект истории с типом (kind). Правила классификации:

1. Один объект — одна запись с одним kind. Не дублируй название под разными kind.
2. Государство, империя, королевство, народ — это state_or_realm. Это НЕ location и НЕ faction, даже если название упомянуто в тексте. В списки locations и factions такие названия не включай.
3. location — конкретное физическое место (город, порт, подвал, станция), куда можно прийти.
4. faction — самостоятельная группа со своими членами и целями (гильдия, орден, клан, армия, организация), существование которой подтверждает текст. В evidence укажи, что именно это подтверждает.
5. Государственный орган, ведомство, должность, канцелярия — government_body. Абстрактные понятия (власть, закон, порядок, доверие) — abstract_concept. Они не фракции без прямых оснований в тексте.
6. plot_line — развивающийся конфликт, цель или нераскрытая тайна, которые продолжаются на протяжении нескольких сцен или глав; ставь isOngoing = true. Единичный факт, отдельный поступок, неопределённое последствие («может иметь последствия») — это consequence_or_fact, а не plot_line.
7. event — отдельное завершённое происшествие. Тесно связанные действия одного эпизода (передача, принятие, сокрытие, изменение отношений в одной сцене) объединяй в ОДНУ запись event: опиши все существенные детали в description, причину в cause, последствия в consequences. Если всё же нужно несколько записей одного эпизода, дай им одинаковый eventGroup. Для остальных eventGroup пустая строка.
8. unnamed_figure — персонаж без имени («незнакомец», «человек в плаще»).
9. world_rule — устойчивое правило мира; полный текст правила в description.
10. Если тип неоднозначен — kind = other.
11. evidence — короткая цитата или близкий пересказ из текста (до 25 слов), подтверждающие тип. confidence — честная оценка от 0 до 1.
12. Для kind, не относящихся к событиям и сюжетным линиям, isOngoing = false, eventGroup, cause, consequences, inWorldDate — пустые строки.`;

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const text = String(body.text ?? "").trim();

    if (!text) {
      return NextResponse.json(
        { error: "Текст для анализа не указан" },
        { status: 400 }
      );
    }

    // Проект нужен для учёта расходов. Клиент передаёт projectId; без него
    // (старый клиент) лимит по-прежнему действует, но строка AiRun не создаётся.
    let projectId: string | null = null;
    if (typeof body.projectId === "string" && body.projectId) {
      const owned = await prisma.project.findFirst({
        where: { id: body.projectId, userId: session.user.id },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
      }
      projectId = owned.id;
    }

    const openai = getOpenAIClient();
    const userContent = `Проанализируй вселенную и разложи информацию по категориям.

Текст автора:

${text}`;

    // Учёт расходов, месячный лимит и потолки токенов.
    const response = await runTrackedAiCall(
      createPrismaTrackingDeps(prisma),
      {
        userId: session.user.id,
        projectId: projectId ?? "",
        roleKey: "STORY_BIBLE_ANALYZE",
        provider: "openai",
        model: "gpt-5.6-luna",
        estimate: inputEstimate("STORY_BIBLE_ANALYZE", ANALYSIS_SYSTEM_PROMPT + userContent),
        skipRecord: !projectId,
      },
      async () => {
    const aiResponse = await openai.responses.create({
      model: "gpt-5.6-luna",
      max_output_tokens: limitsFor("STORY_BIBLE_ANALYZE").maxOutputTokens,
      input: [
        {
          role: "system",
          content: ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "story_bible_analysis",
          strict: true,
          schema: analysisSchema,
        },
      },
    });
    return { value: aiResponse, usage: aiResponse.usage };
      }
    );

    const result = JSON.parse(response.output_text);

    return NextResponse.json({
      ok: true,
      result,
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
    console.error("AI analyze error:", error);

    return NextResponse.json(
      {
        error: "Ошибка OpenAI API или обработки результата.",
      },
      { status: 500 }
    );
  }
}
