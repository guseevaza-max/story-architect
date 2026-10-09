import { NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/auth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  ],
};

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const text = String(body.text ?? "").trim();

    if (!text) {
      return NextResponse.json(
        { error: "Текст для анализа не указан" },
        { status: 400 }
      );
    }

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content:
            "Ты AI-архитектор Story Architect. Извлекай из текста только информацию, которая прямо указана или однозначно следует из текста. Не выдумывай факты. Если категория не представлена, верни пустой массив. Не превращай предположения в факты.",
        },
        {
          role: "user",
          content: `Проанализируй вселенную и разложи информацию по категориям.

Текст автора:

${text}`,
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

    const result = JSON.parse(response.output_text);

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("AI analyze error:", error);

    return NextResponse.json(
      {
        error: "Ошибка OpenAI API или обработки результата.",
      },
      { status: 500 }
    );
  }
}