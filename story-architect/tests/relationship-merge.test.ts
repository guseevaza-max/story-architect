import { describe, expect, it } from "vitest";
import {
  planRelationshipMerge,
  relationshipKey,
  type ActiveRelationship,
} from "../src/lib/canon/relationshipMerge";

function rel(
  id: string,
  from: number | null,
  to: number | null,
  createdAt = 1
): ActiveRelationship {
  return {
    id,
    validFromChapter: from,
    validToChapter: to,
    createdAt: new Date(createdAt),
  };
}

describe("planRelationshipMerge", () => {
  it("без прежних записей создаёт новую и ничего не закрывает", () => {
    expect(planRelationshipMerge([], 5)).toEqual({
      action: "create",
      updateId: null,
      closeIds: [],
    });
  });

  it("закрывает прежнюю действующую запись и создаёт новую", () => {
    const plan = planRelationshipMerge([rel("a", 3, null)], 5);
    expect(plan.action).toBe("create");
    expect(plan.closeIds).toEqual(["a"]);
  });

  it("закрывает ВСЕ действующие записи, а не одну (прежние дубли)", () => {
    const plan = planRelationshipMerge(
      [rel("ch10", 10, null), rel("ch11", 11, null)],
      12
    );
    expect(plan.action).toBe("create");
    expect([...plan.closeIds].sort()).toEqual(["ch10", "ch11"]);
  });

  it("повторная обработка той же главы обновляет запись, а не плодит дубль", () => {
    const plan = planRelationshipMerge([rel("same", 11, null)], 11);
    expect(plan.action).toBe("update");
    expect(plan.updateId).toBe("same");
    expect(plan.closeIds).toEqual([]);
  });

  it("при повторной обработке чинит и более ранний дубль", () => {
    const plan = planRelationshipMerge(
      [rel("old", 10, null), rel("same", 11, null)],
      11
    );
    expect(plan.action).toBe("update");
    expect(plan.updateId).toBe("same");
    expect(plan.closeIds).toEqual(["old"]);
  });

  it("при нескольких записях этой же главы обновляет самую новую и ничего не удаляет", () => {
    const plan = planRelationshipMerge(
      [rel("first", 11, null, 100), rel("second", 11, null, 200)],
      11
    );
    expect(plan.updateId).toBe("second");
    expect(plan.closeIds).toEqual([]);
  });

  it("уже закрытые записи (история) не трогает", () => {
    const plan = planRelationshipMerge(
      [rel("history", 2, 9), rel("current", 10, null)],
      12
    );
    expect(plan.closeIds).toEqual(["current"]);
  });

  it("запись без начальной главы (seed) тоже закрывается", () => {
    const plan = planRelationshipMerge([rel("seed", null, null)], 4);
    expect(plan.closeIds).toEqual(["seed"]);
  });

  it("записи, начатые в более поздней главе, игнорируются", () => {
    const plan = planRelationshipMerge([rel("future", 15, null)], 12);
    expect(plan).toEqual({ action: "create", updateId: null, closeIds: [] });
  });
});

describe("relationshipKey", () => {
  it("направление учитывается: A → B и B → A — разные отношения", () => {
    expect(relationshipKey("kael", "mark", "trust")).not.toBe(
      relationshipKey("mark", "kael", "trust")
    );
  });

  it("регистр и пробелы в типе не создают разные ключи", () => {
    expect(relationshipKey("a", "b", " Trust ")).toBe(
      relationshipKey("a", "b", "trust")
    );
  });
});
