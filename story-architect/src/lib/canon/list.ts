/**
 * Чтение Canon для страницы «Canon»: только подтверждённые факты (status CANON).
 * Ничего не пишет в базу.
 */
import { loreFactPayloadSchema } from "../schemas/loreFact";

export const CANON_SOURCES = ["AUTHOR", "AI_EXTRACTION", "AI_INFERENCE", "SEED"] as const;
export type CanonSourceFilter = (typeof CANON_SOURCES)[number];

export const CANON_SOURCE_LABELS: Record<CanonSourceFilter, string> = {
  AUTHOR: "автор",
  AI_EXTRACTION: "извлечено из материала",
  AI_INFERENCE: "вывод AI",
  SEED: "начальные данные",
};

export type CanonQuery = { q: string; source: CanonSourceFilter | null };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseCanonQuery(
  params: Record<string, string | string[] | undefined>
): CanonQuery {
  const q = first(params.q).trim().slice(0, 100);
  const raw = first(params.source);
  const source = (CANON_SOURCES as readonly string[]).includes(raw)
    ? (raw as CanonSourceFilter)
    : null;
  return { q, source };
}

export function canonFactWhere(projectId: string, query: CanonQuery) {
  return {
    projectId,
    status: "CANON" as const,
    ...(query.source ? { factSource: query.source } : {}),
    ...(query.q
      ? { statement: { contains: query.q, mode: "insensitive" as const } }
      : {}),
  };
}

/** Цитата и название материала из исходного предложения LORE_FACT. */
export function evidenceFromPayload(
  payload: unknown
): { quote: string; materialTitle: string } | null {
  const parsed = loreFactPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  return {
    quote: parsed.data.data.evidenceQuote,
    materialTitle: parsed.data.data.source.materialTitle,
  };
}
