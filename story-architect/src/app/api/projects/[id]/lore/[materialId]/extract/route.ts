import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { AiProviderError, complete, redact } from "@/lib/ai/provider";
import { prisma } from "@/lib/db";
import {
  EXTRACTION_JSON_SCHEMA,
  buildExtractionMessages,
  normalizeStatement,
  parseExtractionResponse,
  prepareSource,
  selectFacts,
} from "@/lib/lore/extraction";
import {
  loreFactPayloadSchema,
  type LoreFactData,
} from "@/lib/schemas/loreFact";

type RouteContext = {
  params: Promise<{ id: string; materialId: string }>;
};

/** Берёт первое непустое строковое поле из списка возможных имён. */
function pickString(
  record: Record<string, unknown>,
  names: readonly string[]
): string {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "string" && value.trim()) return value;
  }

  return "";
}

function payloadMaterialId(payload: unknown): string | null {
  const data = (payload as { data?: { source?: { materialId?: unknown } } } | null)
    ?.data;
  const id = data?.source?.materialId;

  return typeof id === "string" ? id : null;
}

function payloadStatement(payload: unknown): string | null {
  const statement = (payload as { data?: { statement?: unknown } } | null)?.data
    ?.statement;

  return typeof statement === "string" ? statement : null;
}

/**
 * Извлекает факты из материала Lore Library и кладёт их в очередь
 * предложений автору (Proposal LORE_FACT, PENDING). Canon не изменяется.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, materialId } = await params;

    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    // Материал берём из базы и только внутри этого проекта.
    const material = (await prisma.loreMaterial.findFirst({
      where: { id: materialId, projectId: project.id },
    })) as Record<string, unknown> | null;

    if (!material) {
      return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
    }

    const title = pickString(material, ["title", "name"]).slice(0, 300);
    const source = prepareSource(pickString(material, ["content", "text", "body"]));

    if (!source.text) {
      return NextResponse.json(
        { error: "Материал пуст: извлекать нечего." },
        { status: 400 }
      );
    }

    let completion;

    try {
      completion = await complete({
        modelClass: "STRONG",
        temperature: 0.1,
        maxTokens: 12000,
        messages: buildExtractionMessages(title, source.text),
        jsonSchema: EXTRACTION_JSON_SCHEMA as unknown as {
          name: string;
          schema: Record<string, unknown>;
        },
      });
    } catch (error) {
      console.error("Lore extraction AI error:", error);

      return NextResponse.json(
        {
          error:
            error instanceof AiProviderError
              ? `Ошибка AI-провайдера: ${redact(error.message)}`
              : "Не удалось обратиться к AI-провайдеру.",
        },
        { status: error instanceof AiProviderError && !error.status ? 503 : 502 }
      );
    }

    const parsed = parseExtractionResponse(completion.text);

    if (!parsed.ok) {
      // Диагностика без секретов: почему ответ оказался непригодным.
      console.error("Lore extraction: ответ не разобран", {
        model: completion.model,
        finishReason: completion.finishReason ?? null,
        outputTokens: completion.outputTokens,
        textLength: completion.text.length,
      });

      const reason =
        completion.finishReason === "length"
          ? " Модель упёрлась в лимит длины ответа: разбейте материал на части или задайте AI_REASONING_EFFORT=low в .env."
          : completion.finishReason
            ? ` (причина остановки: ${completion.finishReason}, токенов в ответе: ${completion.outputTokens})`
            : "";

      return NextResponse.json({ error: `${parsed.error}${reason}` }, { status: 502 });
    }

    // Что уже есть: ожидающие и отклонённые предложения этого материала
    // и факты, принятые в Canon проекта.
    const [loreProposals, canonFacts] = await Promise.all([
      prisma.proposal.findMany({
        where: {
          projectId: project.id,
          entityType: "LORE_FACT",
          status: { in: ["PENDING", "REJECTED"] },
        },
        select: { status: true, payload: true },
        take: 5000,
      }),
      prisma.canonFact.findMany({
        where: { projectId: project.id, status: "CANON" },
        select: { statement: true },
        take: 10000,
      }),
    ]);

    const pending = new Set<string>();
    const rejected = new Set<string>();

    for (const proposal of loreProposals) {
      if (payloadMaterialId(proposal.payload) !== material.id) continue;

      const statement = payloadStatement(proposal.payload);
      if (!statement) continue;

      (proposal.status === "REJECTED" ? rejected : pending).add(
        normalizeStatement(statement)
      );
    }

    const canon = new Set(
      canonFacts.map((fact) => normalizeStatement(fact.statement))
    );

    const { accepted, skipped } = selectFacts(parsed.facts, source.text, {
      pending,
      rejected,
      canon,
    });

    const payloads = accepted.map((fact) => {
      const data: LoreFactData = {
        statement: fact.statement,
        evidenceQuote: fact.evidenceQuote,
        confidence: fact.confidence,
        category: fact.category,
        ambiguity: fact.ambiguity,
        source: {
          type: "LORE_MATERIAL",
          materialId: String(material.id),
          materialTitle: title || "Без названия",
        },
      };

      return loreFactPayloadSchema.parse({ entityType: "LORE_FACT", data });
    });

    if (payloads.length > 0) {
      await prisma.$transaction(
        payloads.map((payload) =>
          prisma.proposal.create({
            data: {
              projectId: project.id,
              entityType: "LORE_FACT",
              op: "CREATE",
              payload: payload as unknown as Prisma.InputJsonValue,
              reason: `Факт извлечён AI из материала Lore Library «${title || "Без названия"}»`,
              safety: "UNCERTAIN",
              status: "PENDING",
            },
          })
        )
      );
    }

    return NextResponse.json({
      ok: true,
      created: payloads.length,
      skipped,
      truncated: source.truncated,
      invalidItems: parsed.invalidItems,
      model: completion.model,
    });
  } catch (error) {
    console.error("Lore extraction error:", error);

    return NextResponse.json(
      { error: "Не удалось извлечь факты." },
      { status: 500 }
    );
  }
}
