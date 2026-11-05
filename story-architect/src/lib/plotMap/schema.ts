/**
 * Сюжетная карта: проверка данных, которые вводит автор.
 * AI вехи не создаёт и не меняет: эти схемы описывают только авторский ввод.
 */
import { z } from "zod";

export const BEAT_APPROVALS = ["APPROVED", "APPROXIMATE", "IDEA"] as const;
export const BEAT_DISCLOSURES = ["HIDDEN", "HINTED", "PARTIAL", "REVEALED"] as const;

export const BEAT_APPROVAL_LABELS: Record<(typeof BEAT_APPROVALS)[number], string> = {
  APPROVED: "утверждено",
  APPROXIMATE: "примерно",
  IDEA: "черновая идея",
};

export const BEAT_DISCLOSURE_LABELS: Record<(typeof BEAT_DISCLOSURES)[number], string> = {
  HIDDEN: "скрыто от читателя",
  HINTED: "только намёки",
  PARTIAL: "раскрыто частично",
  REVEALED: "раскрыто полностью",
};

/** Пустая строка = «автор ещё не решил»: хранится как null. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Максимум ${max} символов.`)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    });

const chapterNumber = z
  .number()
  .int("Номер главы должен быть целым.")
  .min(1, "Номер главы начинается с 1.")
  .max(999)
  .nullish()
  .transform((value) => value ?? null);

const stringList = (maxItems: number, maxLen: number) =>
  z
    .array(z.string().trim().min(1).max(maxLen))
    .max(maxItems)
    .default([]);

const beatFields = {
  name: z.string().trim().min(1, "Укажи название вехи.").max(200),
  description: optionalText(4000),
  narrativeFunction: optionalText(1000),
  characters: stringList(30, 100),
  causes: optionalText(2000),
  consequences: optionalText(2000),
  plannedChapterFrom: chapterNumber,
  plannedChapterTo: chapterNumber,
  approval: z.enum(BEAT_APPROVALS).default("IDEA"),
  disclosure: z.enum(BEAT_DISCLOSURES).default("HIDDEN"),
  relatedArcs: stringList(30, 200),
  notes: optionalText(2000),
};

export function beatRangeError(
  from: number | null | undefined,
  to: number | null | undefined
): string | null {
  return from != null && to != null && to < from
    ? "Конец диапазона глав не может быть раньше начала."
    : null;
}

function checkRange(
  value: { plannedChapterFrom?: number | null; plannedChapterTo?: number | null },
  ctx: z.RefinementCtx
) {
  const message = beatRangeError(value.plannedChapterFrom, value.plannedChapterTo);
  if (message) {
    ctx.addIssue({ code: "custom", path: ["plannedChapterTo"], message });
  }
}

export const beatCreateSchema = z.object(beatFields).superRefine(checkRange);

/** Для правки: передаются только изменяемые поля. */
export const beatUpdateSchema = z
  .object(
    Object.fromEntries(
      Object.entries(beatFields).map(([key, schema]) => [key, (schema as z.ZodTypeAny).optional()])
    ) as { [K in keyof typeof beatFields]: z.ZodOptional<(typeof beatFields)[K]> }
  )
  .superRefine(checkRange);

export const reorderSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "Повторяющиеся идентификаторы."),
});

export const bookFieldsSchema = z.object({
  bookNumber: z.number().int().min(1).max(50).default(1),
  premise: optionalText(4000),
  mainArc: optionalText(4000),
  plannedEnding: optionalText(4000),
  themes: optionalText(4000),
  centralConflicts: optionalText(4000),
  authorConstraints: optionalText(4000),
});

const secretFields = {
  name: z.string().trim().min(1, "Укажи название тайны.").max(200),
  description: optionalText(4000),
  objectiveTruth: optionalText(4000),
  forbiddenEarly: optionalText(2000),
  hintFromChapter: chapterNumber,
  partialRevealChapter: chapterNumber,
  plannedRevealChapter: chapterNumber,
};

type RevealChapters = {
  hintFromChapter?: number | null;
  partialRevealChapter?: number | null;
  plannedRevealChapter?: number | null;
};

/** Возвращает поле и сообщение, если порядок «намёки → частично → полностью» нарушен. */
export function revealOrderError(
  value: RevealChapters
): { path: keyof RevealChapters; message: string } | null {
  const steps = [
    ["hintFromChapter", value.hintFromChapter, "Намёки"],
    ["partialRevealChapter", value.partialRevealChapter, "Частичное раскрытие"],
    ["plannedRevealChapter", value.plannedRevealChapter, "Полное раскрытие"],
  ] as const;

  let previous: { label: string; chapter: number } | null = null;
  for (const [path, chapter, label] of steps) {
    if (chapter == null) continue;
    if (previous && chapter < previous.chapter) {
      return {
        path,
        message: `${label} не может быть раньше, чем «${previous.label.toLowerCase()}».`,
      };
    }
    previous = { label, chapter };
  }
  return null;
}

function checkRevealOrder(value: RevealChapters, ctx: z.RefinementCtx) {
  const error = revealOrderError(value);
  if (error) {
    ctx.addIssue({ code: "custom", path: [error.path], message: error.message });
  }
}

export const secretCreateSchema = z.object(secretFields).superRefine(checkRevealOrder);

export const secretUpdateSchema = z
  .object(
    Object.fromEntries(
      Object.entries(secretFields).map(([key, schema]) => [key, (schema as z.ZodTypeAny).optional()])
    ) as { [K in keyof typeof secretFields]: z.ZodOptional<(typeof secretFields)[K]> }
  )
  .superRefine(checkRevealOrder);

/** Убирает undefined: в Prisma-update попадают только реально переданные поля. */
export function definedOnly<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
