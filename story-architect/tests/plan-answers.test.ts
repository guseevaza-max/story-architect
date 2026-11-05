import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { normalizeAuthorAnswers } from "../src/lib/chapters/planAnswers";

const Q1 = "Нужно решить, чем занят клиент.";
const Q2 = "Что с телом Салима?";

describe("normalizeAuthorAnswers", () => {
  it("оставляет только заполненные ответы в порядке вопросов", () => {
    expect(
      normalizeAuthorAnswers(
        [
          { question: Q2, answer: "  Остаётся за кадром " },
          { question: Q1, answer: "" },
        ],
        [Q1, Q2]
      )
    ).toEqual([{ question: Q2, answer: "Остаётся за кадром" }]);
  });

  it("нет ответов — undefined", () => {
    expect(normalizeAuthorAnswers(undefined, [Q1])).toBeUndefined();
    expect(normalizeAuthorAnswers([{ question: Q1, answer: " " }], [Q1])).toBeUndefined();
  });

  it("чужой вопрос, не список, битый элемент и слишком длинный ответ — ошибка", () => {
    expect(() => normalizeAuthorAnswers([{ question: "Другой?", answer: "да" }], [Q1])).toThrow(/нет в плане/);
    expect(() => normalizeAuthorAnswers("да", [Q1])).toThrow(/списком/);
    expect(() => normalizeAuthorAnswers([{ question: Q1 }], [Q1])).toThrow(/вопрос и текст/);
    expect(() =>
      normalizeAuthorAnswers([{ question: Q1, answer: "а".repeat(4001) }], [Q1])
    ).toThrow(/длинный/);
  });
});

type Call = { model: string; method: string; args: any };
let calls: Call[] = [];
let overrides: Record<string, (args: any) => unknown> = {};

function makeTx() {
  return new Proxy({}, {
    get: (_t, model: string) =>
      new Proxy({}, {
        get: (_m, method: string) => async (args: any): Promise<unknown> => {
          calls.push({ model, method, args });
          const o = overrides[`${model}.${method}`];
          if (o) return o(args);
          if (method === "findMany") return [];
          if (method === "findFirst" || method === "findUnique") return null;
          return { id: `${model}-${calls.length}`, ...(args?.data ?? {}) };
        },
      }),
  });
}

const plan = {
  chapterPurpose: "Цель",
  openQuestions: [Q1, Q2],
};

function setup(payload: unknown = plan) {
  calls = [];
  overrides = {
    "proposal.findUnique": () => ({
      id: "prop-1",
      projectId: "project-1",
      entityType: "chapter_plan",
      op: "UPDATE",
      status: "PENDING",
      payload,
      aiRunId: null,
      sourceChapterId: "chapter-1",
      project: { userId: "user-1" },
    }),
    "chapter.findFirst": () => ({ id: "chapter-1" }),
  };
  holder.tx = makeTx();
}

const author = authorActorFromSession({ user: { id: "user-1" } });
const savedPlan = () => calls.find((c) => c.model === "chapter" && c.method === "update")?.args.data.plan;

beforeEach(() => setup());

describe("ответы автора в плане главы (applyProposal)", () => {
  it("EDIT_AND_ACCEPT сохраняет ответы в план главы", async () => {
    await applyProposal("prop-1", "EDIT_AND_ACCEPT", author, {
      ...plan,
      authorAnswers: [{ question: Q1, answer: "Клиент — тот же мужчина из главы 1" }],
    });
    expect(savedPlan().authorAnswers).toEqual([
      { question: Q1, answer: "Клиент — тот же мужчина из главы 1" },
    ]);
    expect(savedPlan().openQuestions).toEqual([Q1, Q2]);
  });

  it("обычное принятие не пропускает ответы, пришедшие в самом предложении AI", async () => {
    setup({ ...plan, authorAnswers: [{ question: Q1, answer: "Подсунуто AI" }] });
    await applyProposal("prop-1", "ACCEPT", author);
    expect(savedPlan().authorAnswers).toBeUndefined();
  });

  it("принятие без ответов работает как раньше", async () => {
    await applyProposal("prop-1", "ACCEPT", author);
    expect(savedPlan()).toEqual(plan);
  });

  it("ответ на несуществующий вопрос отклоняется и план не сохраняется", async () => {
    await expect(
      applyProposal("prop-1", "EDIT_AND_ACCEPT", author, {
        ...plan,
        authorAnswers: [{ question: "Чужой вопрос", answer: "да" }],
      })
    ).rejects.toThrow(/нет в плане/);
    expect(savedPlan()).toBeUndefined();
  });
});
