import { describe, expect, it } from "vitest";
import {
  STORY_BIBLE_MAX_LENGTH,
  validateStoryBibleText,
} from "../src/lib/storyBible/text";

describe("validateStoryBibleText", () => {
  it("принимает обычный текст как есть", () => {
    expect(validateStoryBibleText("Город Ривенхольм")).toEqual({
      ok: true,
      text: "Город Ривенхольм",
    });
  });

  it("принимает пустую строку: автор может очистить поле", () => {
    expect(validateStoryBibleText("")).toEqual({ ok: true, text: "" });
  });

  it("не обрезает и не меняет пробелы и переносы", () => {
    const text = "  строка 1\n\nстрока 2  ";
    expect(validateStoryBibleText(text)).toEqual({ ok: true, text });
  });

  it("отклоняет не строку", () => {
    expect(validateStoryBibleText(123).ok).toBe(false);
    expect(validateStoryBibleText(null).ok).toBe(false);
    expect(validateStoryBibleText(undefined).ok).toBe(false);
  });

  it("принимает текст ровно максимальной длины и отклоняет длиннее", () => {
    expect(
      validateStoryBibleText("а".repeat(STORY_BIBLE_MAX_LENGTH)).ok
    ).toBe(true);
    expect(
      validateStoryBibleText("а".repeat(STORY_BIBLE_MAX_LENGTH + 1)).ok
    ).toBe(false);
  });
});
