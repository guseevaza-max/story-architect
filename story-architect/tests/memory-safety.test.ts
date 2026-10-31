import { describe, expect, it } from "vitest";
import {
  splitBySafety,
  splitMemoryBySafety,
  type MemorySafety,
} from "../src/lib/canon/memorySafety";

type Item = { id: number; safety: MemorySafety };

const items: Item[] = [
  { id: 1, safety: "SAFE" },
  { id: 2, safety: "UNCERTAIN" },
  { id: 3, safety: "CONFLICT" },
  { id: 4, safety: "SAFE" },
];

describe("splitBySafety", () => {
  it("SAFE подтверждаются, UNCERTAIN и CONFLICT остаются неподтверждёнными", () => {
    const { confirmed, unconfirmed } = splitBySafety(items);
    expect(confirmed.map((i) => i.id)).toEqual([1, 4]);
    expect(unconfirmed.map((i) => i.id)).toEqual([2, 3]);
  });

  it("ничего не теряется и порядок сохраняется", () => {
    const { confirmed, unconfirmed } = splitBySafety(items);
    expect(confirmed.length + unconfirmed.length).toBe(items.length);
    expect([...confirmed, ...unconfirmed].map((i) => i.id).sort()).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("неизвестное значение достоверности не считается подтверждённым", () => {
    const odd = [{ id: 9, safety: "MAYBE" as unknown as MemorySafety }];
    expect(splitBySafety(odd).confirmed).toEqual([]);
    expect(splitBySafety(odd).unconfirmed).toHaveLength(1);
  });

  it("пустой список", () => {
    expect(splitBySafety([])).toEqual({ confirmed: [], unconfirmed: [] });
  });
});

describe("splitMemoryBySafety", () => {
  const memory = {
    chapterId: "ch1",
    shortSummary: "кратко",
    updates: items,
    characterChanges: [items[0]!, items[1]!],
    relationshipChanges: [items[2]!, items[3]!],
  };

  it("оставляет в подтверждённой копии только SAFE и не меняет прочие поля", () => {
    const { confirmed } = splitMemoryBySafety(memory);
    expect(confirmed.updates.map((i) => i.id)).toEqual([1, 4]);
    expect(confirmed.characterChanges.map((i) => i.id)).toEqual([1]);
    expect(confirmed.relationshipChanges.map((i) => i.id)).toEqual([4]);
    expect(confirmed.chapterId).toBe("ch1");
    expect(confirmed.shortSummary).toBe("кратко");
  });

  it("неподтверждённое сохраняется целиком и считается по updates", () => {
    const { unconfirmed, unconfirmedCount } = splitMemoryBySafety(memory);
    expect(unconfirmed.updates.map((i) => i.id)).toEqual([2, 3]);
    expect(unconfirmed.characterChanges.map((i) => i.id)).toEqual([2]);
    expect(unconfirmed.relationshipChanges.map((i) => i.id)).toEqual([3]);
    expect(unconfirmedCount).toBe(2);
  });

  it("исходный объект не изменяется", () => {
    splitMemoryBySafety(memory);
    expect(memory.updates).toHaveLength(4);
  });
});
