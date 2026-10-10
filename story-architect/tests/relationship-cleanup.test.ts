import { describe, expect, it } from "vitest";
import {
  planRelationshipCleanup,
  type CleanupRecord,
} from "../src/lib/canon/relationshipCleanup";

function rec(
  id: string,
  from: number | null,
  to: number | null,
  createdAt: number
): CleanupRecord {
  return {
    id,
    validFromChapter: from,
    validToChapter: to,
    createdAt: new Date(createdAt),
  };
}

describe("planRelationshipCleanup", () => {
  it("без дублей и пересечений ничего не меняет", () => {
    const plan = planRelationshipCleanup([
      rec("a", 3, 9, 1),
      rec("b", 10, null, 2),
    ]);
    expect(plan.rejectIds).toEqual([]);
    expect(plan.closeUpdates).toEqual([]);
    expect(plan.keepIds).toEqual(["a", "b"]);
  });

  it("в каждой главе оставляет самую свежую запись, остальные отклоняет", () => {
    const plan = planRelationshipCleanup([
      rec("old10", 10, null, 1),
      rec("new10", 10, null, 5),
      rec("old11", 11, null, 2),
      rec("new11", 11, null, 9),
    ]);
    expect(plan.keepIds).toEqual(["new10", "new11"]);
    expect([...plan.rejectIds].sort()).toEqual(["old10", "old11"]);
  });

  it("закрывает окно победителя, перекрывающее следующего", () => {
    const plan = planRelationshipCleanup([
      rec("w10", 10, null, 5),
      rec("w11", 11, null, 9),
    ]);
    expect(plan.closeUpdates).toEqual([
      { id: "w10", validToChapter: 10, previousValidTo: null },
    ]);
  });

  it("не расширяет уже закрытое окно", () => {
    const plan = planRelationshipCleanup([
      rec("w2", 2, 4, 1),
      rec("w10", 10, null, 5),
    ]);
    expect(plan.closeUpdates).toEqual([]);
  });

  it("последний победитель не меняется", () => {
    const plan = planRelationshipCleanup([rec("only", 11, null, 9)]);
    expect(plan.closeUpdates).toEqual([]);
    expect(plan.rejectIds).toEqual([]);
  });

  it("сценарий проекта: 7 записей главы 10 и 2 записи главы 11", () => {
    const records = [
      rec("a1", 10, null, 1),
      rec("a2", 10, null, 2),
      rec("a3", 10, null, 3),
      rec("a4", 10, null, 4),
      rec("a5", 10, null, 5),
      rec("a6", 10, 10, 6),
      rec("a7", 10, null, 8),
      rec("b1", 11, null, 7),
      rec("b2", 11, null, 9),
    ];
    const plan = planRelationshipCleanup(records);

    expect(plan.keepIds).toEqual(["a7", "b2"]);
    expect(plan.rejectIds).toHaveLength(7);
    expect(plan.closeUpdates).toEqual([
      { id: "a7", validToChapter: 10, previousValidTo: null },
    ]);
  });

  it("запись без начальной главы идёт первой и не конфликтует", () => {
    const plan = planRelationshipCleanup([
      rec("seed", null, null, 1),
      rec("c5", 5, null, 2),
    ]);
    expect(plan.keepIds).toEqual(["seed", "c5"]);
    expect(plan.closeUpdates).toEqual([
      { id: "seed", validToChapter: 4, previousValidTo: null },
    ]);
  });
});
