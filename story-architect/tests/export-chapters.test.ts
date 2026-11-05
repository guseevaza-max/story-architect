import { describe, expect, it } from "vitest";
import { exportText, parseExportQuery, selectChapters, toParagraphs } from "../src/lib/export/chapters";

const ch = (number: number, draftText: string | null, finalText: string | null = null) => ({
  number, title: null, status: "DRAFT", draftText, finalText,
});

describe("экспорт глав", () => {
  it("финальный текст важнее черновика", () => {
    expect(exportText(ch(1, "черновик", "финал"))).toBe("финал");
    expect(exportText(ch(1, " черновик "))).toBe("черновик");
  });

  it("главы без текста пропускаются, порядок по номеру, диапазон учитывается", () => {
    const list = [ch(3, "c"), ch(1, "a"), ch(2, null), ch(4, "  ")];
    expect(selectChapters(list, { from: null, to: null }).map((c) => c.number)).toEqual([1, 3]);
    expect(selectChapters(list, { from: 2, to: 3 }).map((c) => c.number)).toEqual([3]);
  });

  it("параметры диапазона читаются безопасно", () => {
    expect(parseExportQuery({ from: "2", to: "x" })).toEqual({ from: 2, to: null });
    expect(parseExportQuery({ from: "0" })).toEqual({ from: null, to: null });
  });

  it("абзацы делятся по пустым строкам", () => {
    expect(toParagraphs("а\r\n\r\nб\nв\n\n\n г ")).toEqual(["а", "б\nв", "г"]);
  });
});
