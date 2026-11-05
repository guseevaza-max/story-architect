import { describe, expect, it } from "vitest";
import { revertsToApproved } from "../src/lib/chapters/draftEdit";

const canon = { status: "CANON", draftText: "Старый текст.", finalText: "Старый текст." };

describe("revertsToApproved", () => {
  it("изменённый текст главы в Canon возвращает её в «Утверждена»", () => {
    expect(revertsToApproved(canon, "Старый текст. У Петра есть дочь Мира.")).toBe(true);
  });

  it("тот же текст (или отличие только в пробелах по краям) — без возврата", () => {
    expect(revertsToApproved(canon, "Старый текст.")).toBe(false);
    expect(revertsToApproved(canon, "  Старый текст.\n")).toBe(false);
  });

  it("сравнивает с finalText, а не с уже изменённым черновиком", () => {
    const edited = { ...canon, draftText: "Текст с правкой." };
    expect(revertsToApproved(edited, "Текст с правкой.")).toBe(true);
    expect(revertsToApproved(edited, "Старый текст.")).toBe(false);
  });

  it("главы не в Canon не затрагиваются", () => {
    for (const status of ["DRAFT", "APPROVED", "PLANNED"]) {
      expect(revertsToApproved({ ...canon, status }, "Любой другой текст")).toBe(false);
    }
  });

  it("без finalText сравнивает с черновиком", () => {
    expect(
      revertsToApproved({ status: "CANON", draftText: "А", finalText: null }, "Б")
    ).toBe(true);
  });
});
