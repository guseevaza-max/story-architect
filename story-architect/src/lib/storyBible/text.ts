/** Максимальная длина исходного текста Story Bible (в символах). */
export const STORY_BIBLE_MAX_LENGTH = 200_000;

export type StoryBibleTextCheck =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Проверка текста, пришедшего от клиента.
 * Пустая строка допустима: автор может очистить поле.
 */
export function validateStoryBibleText(value: unknown): StoryBibleTextCheck {
  if (typeof value !== "string") {
    return { ok: false, error: "Текст должен быть строкой." };
  }

  if (value.length > STORY_BIBLE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Текст слишком длинный: максимум ${STORY_BIBLE_MAX_LENGTH} символов.`,
    };
  }

  return { ok: true, text: value };
}
