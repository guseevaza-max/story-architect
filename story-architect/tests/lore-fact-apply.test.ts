import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Принятие, редактирование и отклонение предложений LORE_FACT через
 * НАСТОЯЩУЮ функцию applyProposal.
 *
 * Важно: это НЕ тест на реальной базе данных. База заменена записывающей
 * заглушкой; вся логика applyProposal, машина состояний предложений и
 * проверка схем настоящие.
 */

const holder = vi.hoisted(() => ({ tx: null as unknown }));

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
                    return { id: `${model}-${calls.length}`, ...(args?.data ?? {}) };
                }
              },
          }
        ),
    }
  );
}

const QUOTE = "Империя Пепла основана императором Каэлем в 312 году.";

const payload = {
  entityType: "LORE_FACT",
  data: {
    statement: "Империю Пепла основал император Каэль",
    evidenceQuote: QUOTE,
    confidence: 0.9,
    category: "HISTORY",
    ambiguity: "Дата приблизительна",
    source: { type: "LORE_MATERIAL", materialId: "m1", materialTitle: "Хроники" },
  },
};

const author = authorActorFromSession({ user: { id: "user-1" } });

function setup(
  options: { status?: string; op?: string; payload?: unknown; existingFact?: boolean } = {}
) {
  calls = [];
  overrides = {
    "proposal.findUnique": () => ({
      id: "prop-1",
      projectId: "project-1",
      entityType: "LORE_FACT",
      op: options.op ?? "CREATE",
      status: options.status ?? "PENDING",
      payload: options.payload ?? payload,
      aiRunId: null,
      sourceChapterId: null,
      project: { userId: "user-1" },
    }),
    "canonFact.findFirst": () => (options.existingFact ? { id: "fact-existing" } : null),
  };
  holder.tx = makeTx();
}

const created = (model: string) =>
  calls.filter((c) => c.model === model && c.method === "create");

beforeEach(() => setup());

describe("принятие факта Lore Library", () => {
  it("создаёт ровно один CanonFact с нужными полями", async () => {
    const result = await applyProposal("prop-1", "ACCEPT", author);

    const facts = created("canonFact");
    expect(facts).toHaveLength(1);

    const data = facts[0]?.args.data;
    expect(data.statement).toBe("Империю Пепла основал император Каэль");
    expect(data.status).toBe("CANON");
    expect(data.factSource).toBe("AI_EXTRACTION");
    expect(data.confidence).toBe(0.9);
    expect(data.sourceProposalId).toBe("prop-1");
    expect(data.projectId).toBe("project-1");

    expect(result.canonChanged).toBe(true);
    expect(result.canonEntityId).toBeTruthy();
  });

  it("предложение помечается принятым и связывается с созданным фактом", async () => {
    await applyProposal("prop-1", "ACCEPT", author);

    const update = calls.find((c) => c.model === "proposal" && c.method === "update");
    expect(update?.args.data.status).toBe("ACCEPTED");
    expect(update?.args.data.entityId).toBeTruthy();
    expect(update?.args.data.reviewedById).toBe("user-1");
  });

  it("происхождение и цитата сохраняются в журнале изменений", async () => {
    await applyProposal("prop-1", "ACCEPT", author);

    const log = created("changeLog")[0]?.args.data;
    expect(log.entityType).toBe("LORE_FACT");
    expect(log.actorType).toBe("AUTHOR");
    expect(log.proposalId).toBe("prop-1");
    expect(log.after.data.evidenceQuote).toBe(QUOTE);
    expect(log.after.data.source.materialId).toBe("m1");
    expect(log.after.data.source.materialTitle).toBe("Хроники");
  });

  it("исходное предложение с цитатой и источником не изменяется", async () => {
    await applyProposal("prop-1", "ACCEPT", author);

    const update = calls.find((c) => c.model === "proposal" && c.method === "update");
    // принятие без правки не переписывает payload предложения
    expect(update?.args.data.editedPayload).toBeUndefined();
    expect(payload.data.evidenceQuote).toBe(QUOTE);
  });
});

describe("идемпотентность", () => {
  it("повторное принятие уже принятого предложения отклоняется и не создаёт факт", async () => {
    setup({ status: "ACCEPTED" });

    await expect(applyProposal("prop-1", "ACCEPT", author)).rejects.toThrow();
    expect(created("canonFact")).toHaveLength(0);
  });

  it("если факт для этого предложения уже есть, второй не создаётся", async () => {
    setup({ existingFact: true });

    const result = await applyProposal("prop-1", "ACCEPT", author);

    expect(created("canonFact")).toHaveLength(0);
    expect(result.canonEntityId).toBe("fact-existing");

    const lookup = calls.find((c) => c.model === "canonFact" && c.method === "findFirst");
    expect(lookup?.args.where).toEqual({
      projectId: "project-1",
      sourceProposalId: "prop-1",
    });
  });
});

describe("редактирование с принятием", () => {
  it("используется отредактированное утверждение, цитата и происхождение исходные", async () => {
    await applyProposal("prop-1", "EDIT_AND_ACCEPT", author, {
      data: {
        statement: "Империя Пепла возникла в 312 году",
        evidenceQuote: "ПОДМЕНЁННАЯ ЦИТАТА, которой нет в источнике",
        source: { type: "LORE_MATERIAL", materialId: "другой", materialTitle: "Подмена" },
        confidence: 0.1,
      },
    });

    const fact = created("canonFact")[0]?.args.data;
    expect(fact.statement).toBe("Империя Пепла возникла в 312 году");
    // уверенность берётся из исходного payload, а не из правки
    expect(fact.confidence).toBe(0.9);

    const update = calls.find((c) => c.model === "proposal" && c.method === "update");
    const saved = update?.args.data.editedPayload;
    expect(saved.data.statement).toBe("Империя Пепла возникла в 312 году");
    expect(saved.data.evidenceQuote).toBe(QUOTE);
    expect(saved.data.source.materialId).toBe("m1");
    expect(saved.data.source.materialTitle).toBe("Хроники");
  });

  it("допускается правка в упрощённой форме { statement }", async () => {
    await applyProposal("prop-1", "EDIT_AND_ACCEPT", author, { statement: "Короткая правка" });
    expect(created("canonFact")[0]?.args.data.statement).toBe("Короткая правка");
  });

  it("пустое утверждение при правке отклоняется, факт не создаётся", async () => {
    await expect(
      applyProposal("prop-1", "EDIT_AND_ACCEPT", author, { data: { statement: "   " } })
    ).rejects.toThrow();
    expect(created("canonFact")).toHaveLength(0);
  });
});

describe("отклонение и защита Canon", () => {
  it("отклонение не создаёт CanonFact и не пишет в журнал Canon", async () => {
    await applyProposal("prop-1", "REJECT", author);

    expect(created("canonFact")).toHaveLength(0);
    expect(created("changeLog").filter((c) => c.args.data.entityType === "LORE_FACT")).toHaveLength(0);

    const update = calls.find((c) => c.model === "proposal" && c.method === "update");
    expect(update?.args.data.status).toBe("REJECTED");
  });

  it("не-автор не может принять факт", async () => {
    const notAuthor = { type: "AI", userId: "" } as unknown as typeof author;

    await expect(applyProposal("prop-1", "ACCEPT", notAuthor)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("повреждённый payload не создаёт факт", async () => {
    setup({ payload: { entityType: "LORE_FACT", data: { statement: "без цитаты" } } });

    await expect(applyProposal("prop-1", "ACCEPT", author)).rejects.toThrow();
    expect(created("canonFact")).toHaveLength(0);
  });

  it("операция, отличная от CREATE, не поддерживается", async () => {
    setup({ op: "UPDATE" });

    await expect(applyProposal("prop-1", "ACCEPT", author)).rejects.toThrow();
    expect(created("canonFact")).toHaveLength(0);
  });
});
