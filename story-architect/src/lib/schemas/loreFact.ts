/**
 * Факт, извлечённый из материала Lore Library.
 *
 * Хранится в Proposal с entityType "LORE_FACT". Сознательно НЕ входит в
 * общую схему proposalPayloadSchema: обработка этого типа отдельная
 * (см. applyProposal), чтобы не затрагивать существующие типы предложений.
 */
import { z } from "zod";

export const LORE_FACT_CATEGORIES = [
  "CHARACTER",
  "LOCATION",
  "FACTION",
  "EVENT",
  "RULE",
  "OBJECT",
  "RELATIONSHIP",
  "HISTORY",
  "OTHER",
] as const;

export type LoreFactCategory = (typeof LORE_FACT_CATEGORIES)[number];

export const LORE_FACT_CATEGORY_LABELS: Record<LoreFactCategory, string> = {
  CHARACTER: "персонаж",
  LOCATION: "локация",
  FACTION: "фракция",
  EVENT: "событие",
  RULE: "правило мира",
  OBJECT: "предмет",
  RELATIONSHIP: "отношения",
  HISTORY: "история мира",
  OTHER: "другое",
};

export const LORE_FACT_LIMITS = {
  statement: 600,
  quote: 1200,
  ambiguity: 600,
  title: 300,
} as const;

export const loreFactDataSchema = z.object({
  /** Атомарное фактическое утверждение. */
  statement: z.string().trim().min(1).max(LORE_FACT_LIMITS.statement),
  /** Дословная цитата из исходного материала. */
  evidenceQuote: z.string().min(1).max(LORE_FACT_LIMITS.quote),
  confidence: z.number().min(0).max(1),
  category: z.enum(LORE_FACT_CATEGORIES),
  ambiguity: z.string().max(LORE_FACT_LIMITS.ambiguity).nullable().optional(),
  source: z.object({
    type: z.literal("LORE_MATERIAL"),
    materialId: z.string().min(1),
    materialTitle: z.string().max(LORE_FACT_LIMITS.title),
  }),
});

export const loreFactPayloadSchema = z.object({
  entityType: z.literal("LORE_FACT"),
  data: loreFactDataSchema,
});

export type LoreFactData = z.infer<typeof loreFactDataSchema>;
export type LoreFactPayload = z.infer<typeof loreFactPayloadSchema>;

/**
 * Утверждение из отредактированного автором payload. Допускаются обе формы:
 * { data: { statement } } и { statement }. Остальные поля игнорируются:
 * цитата и происхождение факта всегда остаются исходными.
 */
export function editedLoreStatement(edited: unknown): string | null {
  const record = edited as {
    data?: { statement?: unknown };
    statement?: unknown;
  } | null;

  const candidate = record?.data?.statement ?? record?.statement;

  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}
