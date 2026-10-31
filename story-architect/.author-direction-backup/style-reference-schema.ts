/**
 * Авторский замысел главы и библиотека референсов.
 *
 * Хранение (без новых таблиц):
 *  - Chapter.authorIntent  — замысел конкретной главы (JSON);
 *  - Project.authorReferences — библиотека референсов проекта (JSON-массив).
 *
 * Эти данные описывают ХУДОЖЕСТВЕННОЕ ИСПОЛНЕНИЕ, а не факты мира: они не
 * являются Canon и не могут менять утверждённые события, характеры и факты.
 */
import { z } from "zod";

export const SCALE_VALUES = [
  "CHAMBER",
  "LOCAL",
  "MEDIUM",
  "LARGE",
  "EPIC",
] as const;

export const DRAMA_VALUES = [
  "CALM",
  "TENSE",
  "CONFLICT",
  "HIGH",
  "CLIMAX",
] as const;

export const PACE_VALUES = ["SLOW", "RISING", "FAST", "VARIABLE"] as const;

export const FOCUS_VALUES = [
  "ATMOSPHERE",
  "PSYCHOLOGY",
  "ACTION",
  "MYSTERY",
  "DIALOGUE",
  "HERO_GROWTH",
  "WORLD",
] as const;

export const REFERENCE_CATEGORIES = [
  "NARRATIVE_STYLE",
  "PACE",
  "ATMOSPHERE",
  "DIALOGUE",
  "HERO_GROWTH",
  "DRAMATURGY",
  "EVENT_SCALE",
  "INTRIGUE",
  "OTHER",
] as const;

export const LABELS = {
  scale: {
    CHAMBER: "камерная",
    LOCAL: "локальная",
    MEDIUM: "средняя",
    LARGE: "крупная",
    EPIC: "эпическая",
  },
  drama: {
    CALM: "спокойная",
    TENSE: "напряжённая",
    CONFLICT: "конфликтная",
    HIGH: "высокая",
    CLIMAX: "кульминационная",
  },
  pace: {
    SLOW: "медленный",
    RISING: "нарастающий",
    FAST: "быстрый",
    VARIABLE: "переменный",
  },
  focus: {
    ATMOSPHERE: "атмосфера и погружение",
    PSYCHOLOGY: "психология персонажей",
    ACTION: "действие и масштаб событий",
    MYSTERY: "тайна и неизвестность",
    DIALOGUE: "диалоги и отношения",
    HERO_GROWTH: "развитие героя",
    WORLD: "исследование мира",
  },
  category: {
    NARRATIVE_STYLE: "стиль повествования",
    PACE: "темп",
    ATMOSPHERE: "атмосфера",
    DIALOGUE: "диалоги",
    HERO_GROWTH: "развитие героя",
    DRAMATURGY: "драматургия",
    EVENT_SCALE: "масштаб событий",
    INTRIGUE: "устройство интриги",
    OTHER: "другое",
  },
} as const;

// ───────────────────────── замысел главы ──────────────────────────────────

const optionalText = (max: number) => z.string().max(max).optional();

export const authorIntentSchema = z.object({
  scale: z.enum(SCALE_VALUES).nullable().optional(),
  drama: z.enum(DRAMA_VALUES).nullable().optional(),
  pace: z.enum(PACE_VALUES).nullable().optional(),
  focus: z.enum(FOCUS_VALUES).nullable().optional(),

  /**
   * Выбранные референсы. Не задано (undefined/null) — глава наследует
   * референсы проекта «по умолчанию»; массив (даже пустой) — используются
   * только перечисленные.
   */
  referenceIds: z.array(z.string().min(1).max(100)).max(50).nullable().optional(),

  freePrompt: optionalText(6000),
  readerEffect: optionalText(2000),
  emotionalArc: optionalText(2000),
  mustInclude: optionalText(3000),
  avoid: optionalText(3000),
  compositionNotes: optionalText(3000),
});

export type AuthorIntent = z.infer<typeof authorIntentSchema>;

const TEXT_FIELDS = [
  "freePrompt",
  "readerEffect",
  "emotionalArc",
  "mustInclude",
  "avoid",
  "compositionNotes",
] as const;

const SELECT_FIELDS = ["scale", "drama", "pace", "focus"] as const;

/**
 * Приводит сохранённое или пришедшее значение к чистому замыслу:
 * обрезает пробелы, убирает пустые поля. Если ничего не задано
 * (и наследование референсов не переопределено) — возвращает null.
 */
export function normalizeIntent(raw: unknown): AuthorIntent | null {
  const parsed = authorIntentSchema.safeParse(raw);

  if (!parsed.success) return null;

  const source = parsed.data;
  const result: AuthorIntent = {};

  if (source.scale) result.scale = source.scale;
  if (source.drama) result.drama = source.drama;
  if (source.pace) result.pace = source.pace;
  if (source.focus) result.focus = source.focus;

  for (const field of TEXT_FIELDS) {
    const value = source[field]?.trim();
    if (value) result[field] = value;
  }

  // Пустой массив — осознанное «без референсов», его сохраняем.
  if (Array.isArray(source.referenceIds)) {
    result.referenceIds = [...new Set(source.referenceIds)];
  }

  return Object.keys(result).length > 0 ? result : null;
}

/** Задано ли в замысле хоть что-то, кроме выбора референсов. */
export function hasIntentContent(intent: AuthorIntent | null): boolean {
  if (!intent) return false;

  return (
    SELECT_FIELDS.some((field) => Boolean(intent[field])) ||
    TEXT_FIELDS.some((field) => Boolean(intent[field]))
  );
}

// ───────────────────────── библиотека референсов ──────────────────────────

export const authorReferenceSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  source: z.string().max(300).optional(),
  category: z.enum(REFERENCE_CATEGORIES).default("OTHER"),
  /** Описание художественного приёма. */
  technique: z.string().max(3000).optional(),
  /** Авторская инструкция для ИИ. */
  instruction: z.string().max(4000).optional(),
  /** Заметки автора: в промпты НЕ попадают. */
  notes: z.string().max(3000).optional(),
  active: z.boolean().default(true),
  /** Применять ко всем главам, где не выбраны свои референсы. */
  isDefault: z.boolean().default(false),
});

export type AuthorReference = z.infer<typeof authorReferenceSchema>;

export const MAX_REFERENCES = 200;

/** Вход от клиента: идентификатор можно не указывать, его выдаст сервер. */
export const referenceInputSchema = authorReferenceSchema.extend({
  id: z.string().min(1).max(100).optional(),
});

export const referenceLibraryInputSchema = z
  .array(referenceInputSchema)
  .max(MAX_REFERENCES);

/**
 * Читает сохранённую библиотеку. Повреждённые элементы пропускаются,
 * чтобы одна плохая запись не ломала генерацию.
 */
export function normalizeReferences(raw: unknown): AuthorReference[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const result: AuthorReference[] = [];

  for (const item of raw) {
    const parsed = authorReferenceSchema.safeParse(item);

    if (!parsed.success || seen.has(parsed.data.id)) continue;

    seen.add(parsed.data.id);
    result.push(parsed.data);
  }

  return result;
}

/**
 * Какие референсы применяются к главе (наследование):
 *  - если в замысле явно выбраны референсы — только они (и только активные);
 *  - иначе — активные референсы проекта, помеченные «по умолчанию».
 */
export function resolveReferences(
  intent: AuthorIntent | null,
  library: readonly AuthorReference[]
): AuthorReference[] {
  const active = library.filter((reference) => reference.active);

  if (intent && Array.isArray(intent.referenceIds)) {
    const byId = new Map(active.map((reference) => [reference.id, reference]));

    return intent.referenceIds.flatMap((id) => {
      const reference = byId.get(id);
      return reference ? [reference] : [];
    });
  }

  return active.filter((reference) => reference.isDefault);
}
