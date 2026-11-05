import { describe, expect, it } from "vitest";
import { buildBookPdf, chapterHeading } from "../src/lib/export/pdf";

describe("PDF книги", () => {
  it("заголовок главы", () => {
    expect(chapterHeading({ number: 3, title: "Кайрен" })).toBe("Глава 3. Кайрен");
    expect(chapterHeading({ number: 4, title: null })).toBe("Глава 4");
  });

  it("собирает настоящий PDF с кириллицей и несколькими страницами", async () => {
    const long = Array.from({ length: 80 }, (_, i) => `Абзац ${i}. Салим шёл по коридору Системы.`).join("\n\n");
    const pdf = await buildBookPdf("Параллакс", [
      { number: 1, title: "Начало", status: "DRAFT", draftText: "Первый абзац.\n\nВторой абзац.", finalText: null },
      { number: 2, title: null, status: "CANON", draftText: "x", finalText: long },
    ]);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    expect(pdf.toString("latin1")).toMatch(/\/Count [3-9]/);
  });
});
