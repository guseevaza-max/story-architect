import { describe, expect, it } from "vitest";
import {
  EXTRACTION_JSON_SCHEMA,
  MAX_FACTS,
  MAX_SOURCE_CHARS,
  buildExtractionMessages,
  normalizeStatement,
  parseExtractionResponse,
  prepareSource,
  selectFacts,
  HEDGE_PATTERN,
  verifyQuote,
  type ExistingFacts,
  type RawFact,
} from "../src/lib/lore/extraction";
import {
  editedLoreStatement,
  loreFactPayloadSchema,
} from "../src/lib/schemas/loreFact";

const SOURCE =
  "Империя Пепла основана императором Каэлем в 312 году.\nСтолица империи — Ривенхольм, город у замёрзшего моря.\nГоворят, что под городом лежит древний город.";

const none: ExistingFacts = {
  pending: new Set(),
  rejected: new Set(),
  canon: new Set(),
};

const fact = (partial: Partial<RawFact> = {}): RawFact => ({
  statement: "Империю Пепла основал император Каэль",
  evidenceQuote: "Империя Пепла основана императором Каэлем в 312 году.",
  confidence: 0.95,
  category: "HISTORY",
  ambiguity: "",
  ...partial,
});

describe("prepareSource", () => {
  it("нормализует переносы строк и обрезает пробелы", () => {
    expect(prepareSource("  a\r\nb  ")).toEqual({ text: "a\nb", truncated: false });
  });

  it("длинный текст ограничивается и помечается усечённым", () => {
    const result = prepareSource("Слово. ".repeat(10000));
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX_SOURCE_CHARS);
  });
});

describe("buildExtractionMessages", () => {
  const messages = buildExtractionMessages("Хроники", SOURCE);

  it("содержит правила против выдумки и гипотез", () => {
    const system = messages[0]?.content ?? "";
    expect(system).toContain("Ничего не добавляй");
    expect(system).toContain("гипотезы");
    expect(system).toContain("ТОЧНАЯ цитата");
    expect(system).toContain("ambiguity");
  });

  it("передаёт название и исходный текст", () => {
    const user = messages[1]?.content ?? "";
    expect(user).toContain("Хроники");
    expect(user).toContain("Империя Пепла основана");
  });

  it("схема ответа требует все поля у каждого факта", () => {
    const item = EXTRACTION_JSON_SCHEMA.schema.properties.facts.items;
    expect([...item.required].sort()).toEqual(
      ["ambiguity", "category", "confidence", "evidenceQuote", "statement"].sort()
    );
  });
});

describe("parseExtractionResponse", () => {
  const valid = JSON.stringify({ facts: [fact()] });

  it("разбирает корректный JSON", () => {
    const parsed = parseExtractionResponse(valid);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.facts).toHaveLength(1);
  });

  it("снимает обёртку ```json", () => {
    expect(parseExtractionResponse("```json\n" + valid + "\n```").ok).toBe(true);
  });

  it("находит JSON внутри лишнего текста", () => {
    expect(parseExtractionResponse(`Вот результат: ${valid} Готово.`).ok).toBe(true);
  });

  it("пустой ответ, не JSON и сломанный JSON дают понятную ошибку", () => {
    for (const text of ["", "   ", "просто слова", '{"facts": [']) {
      const parsed = parseExtractionResponse(text);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(5);
    }
  });

  it("отсутствие списка facts — ошибка", () => {
    expect(parseExtractionResponse('{"items": []}').ok).toBe(false);
    expect(parseExtractionResponse('{"facts": "нет"}').ok).toBe(false);
  });

  it("битые элементы пропускаются и считаются, остальные сохраняются", () => {
    const parsed = parseExtractionResponse(
      JSON.stringify({ facts: [fact(), { statement: 5 }, "мусор", fact({ statement: "Второй" })] })
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.facts).toHaveLength(2);
      expect(parsed.invalidItems).toBe(2);
    }
  });

  it("пустой список фактов — не ошибка", () => {
    const parsed = parseExtractionResponse('{"facts": []}');
    expect(parsed.ok).toBe(true);
  });
});

describe("verifyQuote: цитата должна буквально присутствовать в источнике", () => {
  it("точная цитата принимается", () => {
    expect(verifyQuote(SOURCE, "Империя Пепла основана императором Каэлем в 312 году.")).toBe(true);
  });

  it("допускается только различие в пробелах и переносах", () => {
    expect(verifyQuote(SOURCE, "Столица империи —   Ривенхольм,\nгород у замёрзшего моря.")).toBe(true);
  });

  it("выдуманная, перефразированная или изменённая цитата отклоняется", () => {
    expect(verifyQuote(SOURCE, "Империя Пепла была основана императором Каэлем")).toBe(false);
    expect(verifyQuote(SOURCE, "Ривенхольм — столица империи Пепла")).toBe(false);
    expect(verifyQuote(SOURCE, "Империя Пепла основана императором Марком в 312 году.")).toBe(false);
  });

  it("слишком короткая цитата ничего не доказывает", () => {
    expect(verifyQuote(SOURCE, "города")).toBe(false);
    expect(verifyQuote(SOURCE, "   ")).toBe(false);
  });
});

describe("selectFacts", () => {
  it("принимает факт с подтверждённой цитатой", () => {
    const { accepted, skipped } = selectFacts([fact()], SOURCE, none);
    expect(accepted).toHaveLength(1);
    expect(skipped).toEqual([]);
    expect(accepted[0]?.category).toBe("HISTORY");
  });

  it("отклоняет факт с цитатой, которой нет в источнике", () => {
    const { accepted, skipped } = selectFacts(
      [fact({ evidenceQuote: "Император Каэль правил сорок лет подряд." })],
      SOURCE,
      none
    );
    expect(accepted).toEqual([]);
    expect(skipped[0]?.reason).toBe("quote_not_found");
  });

  it("отклоняет пустое утверждение", () => {
    expect(selectFacts([fact({ statement: "   " })], SOURCE, none).skipped[0]?.reason).toBe(
      "empty_statement"
    );
  });

  it("повтор в одном ответе создаёт один факт", () => {
    const { accepted, skipped } = selectFacts(
      [fact(), fact({ statement: "империю  Пепла основал император каэль!" })],
      SOURCE,
      none
    );
    expect(accepted).toHaveLength(1);
    expect(skipped[0]?.reason).toBe("duplicate_in_response");
  });

  it("не дублирует ожидающие, отклонённые и принятые в Canon факты", () => {
    const key = normalizeStatement("Империю Пепла основал император Каэль");

    expect(
      selectFacts([fact()], SOURCE, { ...none, pending: new Set([key]) }).skipped[0]?.reason
    ).toBe("duplicate_pending");
    expect(
      selectFacts([fact()], SOURCE, { ...none, rejected: new Set([key]) }).skipped[0]?.reason
    ).toBe("previously_rejected");
    expect(
      selectFacts([fact()], SOURCE, { ...none, canon: new Set([key]) }).skipped[0]?.reason
    ).toBe("already_canon");
  });

  it("количество фактов ограничено", () => {
    const many = Array.from({ length: MAX_FACTS + 5 }, (_, i) =>
      fact({ statement: `Факт номер ${i}` })
    );
    const { accepted, skipped } = selectFacts(many, SOURCE, none);
    expect(accepted).toHaveLength(MAX_FACTS);
    expect(skipped.filter((s) => s.reason === "limit_exceeded")).toHaveLength(5);
  });

  it("уверенность выше 1 ограничивается единицей, неизвестная категория становится OTHER", () => {
    const { accepted } = selectFacts(
      [fact({ confidence: 7, category: "СТРАННАЯ" })],
      SOURCE,
      none
    );
    expect(accepted[0]?.confidence).toBe(1);
    expect(accepted[0]?.category).toBe("OTHER");
  });

  it("низкая уверенность (гипотеза) не попадает в очередь", () => {
    const { accepted, skipped } = selectFacts(
      [
        fact({ statement: "Слабый", confidence: 0.4 }),
        fact({ statement: "Отрицательный", confidence: -3 }),
        fact({ statement: "Граничный", confidence: 0.5 }),
      ],
      SOURCE,
      none
    );
    expect(accepted.map((f) => f.statement)).toEqual(["Граничный"]);
    expect(skipped.map((s) => s.reason)).toEqual(["low_confidence", "low_confidence"]);
  });

  it("предположения с оговорками («возможно», «по слухам») пропускаются", () => {
    const { accepted, skipped } = selectFacts(
      [
        fact({ statement: "Арен, возможно, знает больше", evidenceQuote: SOURCE.slice(0, 20) }),
        fact({ statement: "Обычный факт" }),
      ],
      SOURCE,
      none
    );
    expect(accepted.map((f) => f.statement)).toEqual(["Обычный факт"]);
    expect(skipped.map((s) => s.reason)).toEqual(["hedged"]);
  });

  it("HEDGE_PATTERN не срабатывает на обычных словах", () => {
    for (const text of ["Невозможно пройти без пропуска", "Видимость ограничена", "Император правит."]) {
      expect(HEDGE_PATTERN.test(text)).toBe(false);
    }
    for (const text of ["Возможно, это ложь", "Он, вероятно, жив", "Говорят, по слухам, так"]) {
      expect(HEDGE_PATTERN.test(text)).toBe(true);
    }
  });

  it("неоднозначность сохраняется, пустая становится null", () => {
    const { accepted } = selectFacts(
      [fact({ ambiguity: "Источник — слух" }), fact({ statement: "Второй", ambiguity: "  " })],
      SOURCE,
      none
    );
    expect(accepted[0]?.ambiguity).toBe("Источник — слух");
    expect(accepted[1]?.ambiguity).toBeNull();
  });
});

describe("схема payload LORE_FACT", () => {
  const data = {
    statement: "Империю Пепла основал император Каэль",
    evidenceQuote: "Империя Пепла основана императором Каэлем в 312 году.",
    confidence: 0.9,
    category: "HISTORY",
    ambiguity: null,
    source: { type: "LORE_MATERIAL", materialId: "m1", materialTitle: "Хроники" },
  };

  it("принимает полный payload с происхождением", () => {
    expect(loreFactPayloadSchema.safeParse({ entityType: "LORE_FACT", data }).success).toBe(true);
  });

  it("требует цитату и источник", () => {
    expect(
      loreFactPayloadSchema.safeParse({ entityType: "LORE_FACT", data: { ...data, evidenceQuote: "" } }).success
    ).toBe(false);
    expect(
      loreFactPayloadSchema.safeParse({
        entityType: "LORE_FACT",
        data: { ...data, source: undefined },
      }).success
    ).toBe(false);
  });

  it("editedLoreStatement понимает обе формы и игнорирует пустое", () => {
    expect(editedLoreStatement({ data: { statement: "  Новое  " } })).toBe("Новое");
    expect(editedLoreStatement({ statement: "Другое" })).toBe("Другое");
    expect(editedLoreStatement({ data: { statement: "   " } })).toBeNull();
    expect(editedLoreStatement(null)).toBeNull();
    expect(editedLoreStatement(undefined)).toBeNull();
  });
});
