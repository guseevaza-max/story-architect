/**
 * Извлечение фактов из материала Lore Library: промпт, разбор ответа AI,
 * проверка цитат и отбор. Чистая логика без базы данных и без вызова модели.
 *
 * Принципы:
 *  - AI только ПРЕДЛАГАЕТ факты: результат превращается в Proposal (PENDING);
 *  - каждая цитата обязана буквально присутствовать в исходном тексте,
 *    иначе факт отклоняется;
 *  - гипотезы, вопросы и предположения фактами не считаются.
 */
import { z } from "zod";
import {
  LORE_FACT_CATEGORIES,
  LORE_FACT_LIMITS,
  type LoreFactCategory,
} from "@/lib/schemas/loreFact";

export const MAX_SOURCE_CHARS = 30_000;
export const MAX_FACTS = 40;
/** Слишком короткая цитата ничего не доказывает. */
export const MIN_QUOTE_CHARS = 12;

// ───────────────────────── подготовка источника ───────────────────────────

export function prepareSource(raw: string): {
  text: string;
  truncated: boolean;
} {
  const text = raw.replace(/\r\n?/g, "\n").trim();

  if (text.length <= MAX_SOURCE_CHARS) return { text, truncated: false };

  const cut = text.slice(0, MAX_SOURCE_CHARS);
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));

  return {
    text: (lastBreak > MAX_SOURCE_CHARS * 0.8 ? cut.slice(0, lastBreak + 1) : cut).trim(),
    truncated: true,
  };
}

// ───────────────────────── запрос к модели ────────────────────────────────

export const EXTRACTION_JSON_SCHEMA = {
  name: "lore_fact_extraction",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      facts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            statement: { type: "string" },
            evidenceQuote: { type: "string" },
            confidence: { type: "number" },
            category: { type: "string", enum: [...LORE_FACT_CATEGORIES] },
            ambiguity: { type: "string" },
          },
          required: [
            "statement",
            "evidenceQuote",
            "confidence",
            "category",
            "ambiguity",
          ],
        },
      },
    },
    required: ["facts"],
  },
} as const;

const SYSTEM_PROMPT = `Ты извлекаешь фактические утверждения из материала Lore Library для системы Story Architect.

Твоя задача — найти в тексте атомарные факты о вымышленном мире и вернуть их для проверки автором. Автор сам решает, что станет Canon.

ПРАВИЛА:
1. Извлекай только то, что прямо сказано в тексте. Ничего не добавляй от себя и не опирайся на внешние знания.
2. Один факт — одно простое утверждение на русском языке (одна мысль, без «и», склеивающих разные факты).
3. НЕ превращай в факты гипотезы, предположения, слухи, вопросы, мечты и желания героев, сослагательные и условные формулировки («возможно», «говорят», «если бы»). Такие места пропусти.
4. Если утверждение зависит от ненадёжного рассказчика или допускает разное прочтение, всё равно можно извлечь его, но опиши причину в поле ambiguity и снизь confidence. Если неоднозначности нет, ambiguity — пустая строка.
5. evidenceQuote — ТОЧНАЯ цитата из текста: непрерывный фрагмент, скопированный символ в символ (без изменений, пересказа и сокращений). Желательно одно-два предложения.
6. confidence — число от 0 до 1: насколько прямо текст подтверждает факт.
7. category — одно значение из списка: ${LORE_FACT_CATEGORIES.join(", ")}.
8. Не более ${MAX_FACTS} фактов; выбирай самые значимые для мира и сюжета.
9. Если в тексте нет подходящих фактов, верни пустой массив facts.

Верни ТОЛЬКО JSON по заданной схеме.`;

export function buildExtractionMessages(title: string, sourceText: string) {
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `НАЗВАНИЕ МАТЕРИАЛА:\n${title || "Без названия"}\n\nТЕКСТ МАТЕРИАЛА:\n"""\n${sourceText}\n"""\n\nИзвлеки факты по правилам.`,
    },
  ];
}

// ───────────────────────── разбор ответа ──────────────────────────────────

const rawFactSchema = z.object({
  statement: z.string(),
  evidenceQuote: z.string(),
  confidence: z.number(),
  category: z.string().optional(),
  ambiguity: z.string().nullable().optional(),
});

export type RawFact = z.infer<typeof rawFactSchema>;

export type ParsedExtraction =
  | { ok: true; facts: RawFact[]; invalidItems: number }
  | { ok: false; error: string };

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenced?.[1] ?? trimmed;
}

export function parseExtractionResponse(text: string): ParsedExtraction {
  const cleaned = stripFences(text);

  if (!cleaned) return { ok: false, error: "AI вернул пустой ответ." };

  let json: unknown;

  try {
    json = JSON.parse(cleaned);
  } catch {
    // Иногда вокруг JSON есть лишний текст: пробуем взять внешний объект.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end <= start) {
      return { ok: false, error: "AI вернул не JSON." };
    }

    try {
      json = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return { ok: false, error: "AI вернул некорректный JSON." };
    }
  }

  const facts =
    json && typeof json === "object" ? (json as { facts?: unknown }).facts : undefined;

  if (!Array.isArray(facts)) {
    return { ok: false, error: "В ответе AI нет списка facts." };
  }

  const valid: RawFact[] = [];
  let invalidItems = 0;

  for (const item of facts) {
    const parsed = rawFactSchema.safeParse(item);

    if (parsed.success) valid.push(parsed.data);
    else invalidItems++;
  }

  return { ok: true, facts: valid, invalidItems };
}

// ───────────────────────── проверка цитат и отбор ─────────────────────────

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * Цитата должна буквально присутствовать в источнике. Допускается только
 * различие в пробелах и переносах строк (текст при этом не меняется).
 */
export function verifyQuote(source: string, quote: string): boolean {
  const trimmed = quote.trim();

  if (trimmed.length < MIN_QUOTE_CHARS) return false;

  return source.includes(trimmed) || collapse(source).includes(collapse(trimmed));
}

export function normalizeStatement(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'“”„‘’.,;:!?()[\]—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type SkipReason =
  | "empty_statement"
  | "quote_not_found"
  | "duplicate_in_response"
  | "duplicate_pending"
  | "previously_rejected"
  | "already_canon"
  | "limit_exceeded";

export type SelectedFact = {
  statement: string;
  evidenceQuote: string;
  confidence: number;
  category: LoreFactCategory;
  ambiguity: string | null;
};

export type SkippedFact = { statement: string; reason: SkipReason };

export type ExistingFacts = {
  /** Нормализованные утверждения, ожидающие решения для ЭТОГО материала. */
  pending: ReadonlySet<string>;
  /** Нормализованные утверждения, отклонённые автором для ЭТОГО материала. */
  rejected: ReadonlySet<string>;
  /** Нормализованные утверждения, уже принятые в Canon проекта. */
  canon: ReadonlySet<string>;
};

const categorySet = new Set<string>(LORE_FACT_CATEGORIES);

export function selectFacts(
  rawFacts: readonly RawFact[],
  source: string,
  existing: ExistingFacts
): { accepted: SelectedFact[]; skipped: SkippedFact[] } {
  const accepted: SelectedFact[] = [];
  const skipped: SkippedFact[] = [];
  const seen = new Set<string>();

  for (const raw of rawFacts) {
    const statement = collapse(raw.statement).slice(0, LORE_FACT_LIMITS.statement);

    if (!statement) {
      skipped.push({ statement: raw.statement, reason: "empty_statement" });
      continue;
    }

    // Неподтверждённые цитатой результаты отклоняются.
    if (!verifyQuote(source, raw.evidenceQuote)) {
      skipped.push({ statement, reason: "quote_not_found" });
      continue;
    }

    const key = normalizeStatement(statement);

    if (seen.has(key)) {
      skipped.push({ statement, reason: "duplicate_in_response" });
      continue;
    }

    if (existing.pending.has(key)) {
      skipped.push({ statement, reason: "duplicate_pending" });
      continue;
    }

    if (existing.rejected.has(key)) {
      skipped.push({ statement, reason: "previously_rejected" });
      continue;
    }

    if (existing.canon.has(key)) {
      skipped.push({ statement, reason: "already_canon" });
      continue;
    }

    if (accepted.length >= MAX_FACTS) {
      skipped.push({ statement, reason: "limit_exceeded" });
      continue;
    }

    seen.add(key);

    const ambiguity = raw.ambiguity?.trim();

    accepted.push({
      statement,
      // Цитата сохраняется в том виде, как она встречается в запросе проверки.
      evidenceQuote: raw.evidenceQuote.trim().slice(0, LORE_FACT_LIMITS.quote),
      confidence: Math.min(1, Math.max(0, Number.isFinite(raw.confidence) ? raw.confidence : 0)),
      category: categorySet.has(raw.category ?? "")
        ? (raw.category as LoreFactCategory)
        : "OTHER",
      ambiguity: ambiguity ? ambiguity.slice(0, LORE_FACT_LIMITS.ambiguity) : null,
    });
  }

  return { accepted, skipped };
}
