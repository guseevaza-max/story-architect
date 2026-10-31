import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Проверка НАСТОЯЩЕЙ функции applyProposal на пакете Memory Update со
 * смесью SAFE / UNCERTAIN / CONFLICT.
 *
 * Важно: это НЕ тест на реальной базе данных. База данных заменена
 * записывающей заглушкой (все вызовы Prisma фиксируются в памяти), а вся
 * логика applyProposal, разбор пакета и проверка схем настоящие.
 */

const holder = vi.hoisted(() => ({
  tx: null as unknown,
}));

vi.mock("@prisma/client", () => ({
  Prisma: { JsonNull: "__JsonNull__", DbNull: "__DbNull__" },
  PrismaClient: class {
    $transaction(callback: (tx: unknown) => unknown) {
      return callback(holder.tx);
    }
  },
}));

import { authorActorFromSession } from "../src/lib/canon/actor";
import { applyProposal } from "../src/lib/canon/write";

type Call = { model: string; method: string; args: any };

let calls: Call[] = [];
let overrides: Record<string, (args: any) => unknown> = {};

function makeTx() {
  return new Proxy(
    {},
    {
      get: (_target, model: string) =>
        new Proxy(
          {},
          {
            get:
              (_models, method: string) =>
              async (args: any): Promise<unknown> => {
                calls.push({ model, method, args });

                const override = overrides[`${model}.${method}`];
                if (override) return override(args);

                switch (method) {
                  case "findMany":
                    return [];
                  case "findFirst":
                  case "findUnique":
                    return null;
                  case "updateMany":
                  case "deleteMany":
                    return { count: 0 };
                  default:
                    return {
                      id: `${model}-${calls.length}`,
                      ...(args?.data ?? {}),
                    };
                }
              },
          }
        ),
    }
  );
}

const chapterId = "chapter-11";

function update(partial: Record<string, unknown>) {
  return {
    type: "FACT",
    title: "Пункт",
    content: "Содержание",
    reason: "Основание в тексте",
    confidence: 0.8,
    safety: "SAFE",
    ...partial,
  };
}

const memoryPayload = {
  chapterId,
  shortSummary: "Каэль спасает Марка.",
  fullSummary: "Каэль спасает Марка на мосту. Звонок остаётся без ответа.",
  worldDelta: { changes: ["Мост разрушен"] },
  updates: [
    update({
      type: "CHARACTER_CHANGE",
      title: "Каэль теперь благодарен Марку",
      characterName: "Каэль",
      attribute: "отношение к Марку",
      newValue: "благодарен",
      safety: "SAFE",
    }),
    update({
      type: "CHARACTER_CHANGE",
      title: "Каэль скрывает рану",
      characterName: "Каэль",
      attribute: "здоровье",
      newValue: "скрывает рану",
      safety: "UNCERTAIN",
    }),
    update({
      type: "CHARACTER_CHANGE",
      title: "Марк погиб",
      characterName: "Марк",
      attribute: "статус",
      newValue: "мёртв",
      safety: "CONFLICT",
    }),
    update({
      type: "RELATIONSHIP_CHANGE",
      title: "Доверие Каэля к Марку выросло",
      sourceCharacterName: "Каэль",
      targetCharacterName: "Марк",
      relationType: "trust",
      newValue: "Доверие выросло после спасения",
      safety: "SAFE",
    }),
    update({
      type: "RELATIONSHIP_CHANGE",
      title: "Каэль боится Марка",
      sourceCharacterName: "Каэль",
      targetCharacterName: "Марк",
      relationType: "fear",
      newValue: "Каэль боится Марка",
      safety: "CONFLICT",
    }),
    update({
      type: "QUESTION",
      title: "Кто звонил в третий раз?",
      content: "Тайна третьего звонка остаётся неразгаданной",
      safety: "SAFE",
    }),
    update({
      type: "SECRET",
      title: "Возможный предатель",
      content: "Возможно, Марк работает на Совет",
      safety: "UNCERTAIN",
    }),
  ],
};

const author = authorActorFromSession({ user: { id: "user-1" } });

function setupDatabase(payload: unknown = memoryPayload) {
  calls = [];
  overrides = {
    "proposal.findUnique": () => ({
      id: "prop-1",
      projectId: "project-1",
      entityType: "memory_update",
      op: "CREATE",
      status: "PENDING",
      payload,
      sourceChapterId: chapterId,
      project: { userId: "user-1" },
    }),
    "chapter.findFirst": () => ({
      id: chapterId,
      number: 11,
      status: "CANON",
      title: "Мост",
      projectId: "project-1",
    }),
    "chapter.findUnique": () => ({
      id: chapterId,
      number: 11,
      status: "CANON",
      title: "Мост",
      projectId: "project-1",
    }),
    "character.findMany": () => [
      { id: "c-kael", name: "Каэль", aliases: [] },
      { id: "c-mark", name: "Марк", aliases: [] },
    ],
  };
  holder.tx = makeTx();
}

const created = (model: string) =>
  calls.filter((c) => c.model === model && c.method === "create");

beforeEach(() => setupDatabase());

describe("Memory Update со SAFE, UNCERTAIN и CONFLICT (настоящий applyProposal, заглушка БД)", () => {
  it("принятие проходит, пакет помечается принятым", async () => {
    await applyProposal("prop-1", "ACCEPT", author);

    const finalUpdate = calls.find(
      (c) => c.model === "proposal" && c.method === "update"
    );
    expect(finalUpdate?.args.data.status).toBe("ACCEPTED");
  });

  it("в состояние персонажей записывается только SAFE-изменение", async () => {
    await applyProposal("prop-1", "ACCEPT", author);

    const states = created("characterState");
    expect(states).toHaveLength(1);
    expect(states[0]?.args.data.attribute).toBe("отношение к Марку");
    expect(states[0]?.args.data.status).toBe("CANON");

    const attributes = states.map((s) => s.args.data.attribute);
    expect(attributes).not.toContain("здоровье");
    expect(attributes).not.toContain("статус");
  });

  it("в отношения записывается только SAFE-связь, конфликтная не создаётся", async () => {
    await applyProposal("prop-1", "ACCEPT", author);

    const relationships = created("relationship");
    expect(relationships).toHaveLength(1);
    expect(relationships[0]?.args.data.relationType).toBe("trust");
    expect(relationships[0]?.args.data.status).toBe("CANON");
  });

  it("память для генераторов содержит SAFE и не содержит сомнительных пунктов", async () => {
    await applyProposal("prop-1", "ACCEPT", author);

    const chunk = created("memoryChunk")[0];
    const content: string = chunk?.args.data.content ?? "";

    expect(content).toContain("Мост разрушен");
    expect(content).toContain("Доверие выросло после спасения");
    expect(content).toContain("Тайна третьего звонка остаётся неразгаданной");

    expect(content).not.toContain("скрывает рану");
    expect(content).not.toContain("мёртв");
    expect(content).not.toContain("боится Марка");
    expect(content).not.toContain("работает на Совет");
  });

  it("сомнительные пункты не теряются: они сохранены в metadata.unconfirmed", async () => {
    await applyProposal("prop-1", "ACCEPT", author);

    const metadata = created("memoryChunk")[0]?.args.data.metadata;
    const unconfirmed = metadata.unconfirmed;

    expect(metadata.unconfirmedCount).toBe(4);
    expect(unconfirmed.updates).toHaveLength(4);
    expect(
      unconfirmed.updates.map((u: { safety: string }) => u.safety).sort()
    ).toEqual(["CONFLICT", "CONFLICT", "UNCERTAIN", "UNCERTAIN"]);
    expect(JSON.stringify(unconfirmed)).toContain("Марк погиб");
    expect(JSON.stringify(unconfirmed)).toContain("Возможный предатель");

    // Подтверждённая часть в metadata.updates не содержит сомнительного.
    expect(metadata.updates).toHaveLength(3);
    expect(
      metadata.updates.every((u: { safety: string }) => u.safety === "SAFE")
    ).toBe(true);
  });

  it("подтверждённых и сомнительных вместе столько же, сколько в исходном пакете", async () => {
    await applyProposal("prop-1", "ACCEPT", author);

    const metadata = created("memoryChunk")[0]?.args.data.metadata;
    expect(
      metadata.updates.length + metadata.unconfirmed.updates.length
    ).toBe(memoryPayload.updates.length);
  });

  it("пакет без сомнительных пунктов работает как раньше", async () => {
    setupDatabase({
      ...memoryPayload,
      updates: memoryPayload.updates.filter((u) => u.safety === "SAFE"),
    });

    await applyProposal("prop-1", "ACCEPT", author);

    expect(created("characterState")).toHaveLength(1);
    expect(created("relationship")).toHaveLength(1);

    const metadata = created("memoryChunk")[0]?.args.data.metadata;
    expect(metadata.unconfirmedCount).toBe(0);
    expect(metadata.unconfirmed.updates).toEqual([]);
  });

  it("отклонение пакета ничего не записывает в Canon", async () => {
    await applyProposal("prop-1", "REJECT", author);

    for (const model of [
      "characterState",
      "relationship",
      "memoryChunk",
      "chapterSummary",
      "character",
    ]) {
      expect(created(model)).toHaveLength(0);
    }
  });

  it("не-автор не может применить пакет", async () => {
    const notAuthor = { type: "AI", userId: "" } as unknown as typeof author;

    await expect(applyProposal("prop-1", "ACCEPT", notAuthor)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
