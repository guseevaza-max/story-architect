import { describe, expect, it } from "vitest";
import {
  canonFactWhere,
  evidenceFromPayload,
  parseCanonQuery,
} from "../src/lib/canon/list";

describe("parseCanonQuery", () => {
  it("читает поиск и источник, мусор отбрасывает", () => {
    expect(parseCanonQuery({ q: "  Кристалит ", source: "AI_EXTRACTION" })).toEqual({
      q: "Кристалит",
      source: "AI_EXTRACTION",
    });
    expect(parseCanonQuery({ source: "HACK" })).toEqual({ q: "", source: null });
    expect(parseCanonQuery({ q: ["a", "b"] }).q).toBe("a");
    expect(parseCanonQuery({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("canonFactWhere", () => {
  it("всегда ограничен проектом и статусом CANON", () => {
    expect(canonFactWhere("p1", { q: "", source: null })).toEqual({
      projectId: "p1",
      status: "CANON",
    });
  });

  it("добавляет фильтры", () => {
    expect(canonFactWhere("p1", { q: "ключ", source: "AUTHOR" })).toEqual({
      projectId: "p1",
      status: "CANON",
      factSource: "AUTHOR",
      statement: { contains: "ключ", mode: "insensitive" },
    });
  });
});

describe("evidenceFromPayload", () => {
  const good = {
    entityType: "LORE_FACT",
    data: {
      statement: "Кристалит — источник энергии",
      evidenceQuote: "Кристалит питает город.",
      confidence: 0.9,
      category: "OBJECT",
      ambiguity: null,
      source: { type: "LORE_MATERIAL", materialId: "m1", materialTitle: "Хроники" },
    },
  };

  it("достаёт цитату и материал", () => {
    expect(evidenceFromPayload(good)).toEqual({
      quote: "Кристалит питает город.",
      materialTitle: "Хроники",
    });
  });

  it("чужой или битый payload даёт null", () => {
    expect(evidenceFromPayload(null)).toBeNull();
    expect(evidenceFromPayload({ entityType: "character" })).toBeNull();
  });
});
