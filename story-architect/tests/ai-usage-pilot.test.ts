import { beforeEach, describe, expect, it, vi } from "vitest";

/** Пилот: Scene Planner с учётом расходов. База и модель заменены заглушками. */

const h = vi.hoisted(() => ({
  reserveOk: true,
  usage: { input_tokens: 2000, output_tokens: 1000 } as any,
  runs: [] as any[],
  settles: [] as any[],
  proposals: 0,
}));

vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/ai/provider", () => ({
  hasOpenAIKey: () => true,
  getOpenAIClient: () => ({
    responses: {
      create: async () => ({ output_text: JSON.stringify({ scenes: [], openQuestions: [] }), usage: h.usage }),
    },
  }),
}));
vi.mock("@/lib/context/storyState", () => ({ buildStoryState: async () => "СОСТОЯНИЕ" }));
vi.mock("@/lib/authorIntent/load", () => ({ loadAuthorDirectionBlock: async () => "" }));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    project = { findFirst: async () => ({ id: "p1", name: "Параллакс" }) };
    chapter = {
      findFirst: async () => ({ id: "c1", bookId: "b1", number: 1, title: "Г", authorIdea: null, plan: { a: 1 }, planApproved: true, book: { number: 1, title: "К" } }),
    };
    proposal = { create: async () => { h.proposals += 1; return { id: "pr1", entityType: "scene_plan", status: "PENDING", sourceChapterId: "c1" }; } };
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $executeRawUnsafe: async (sql: string, ...args: any[]) => {
      if (sql.includes('SET "reservedUsd" = GREATEST')) h.settles.push(args);
      return 1;
    },
    $queryRawUnsafe: async () => (h.reserveOk ? [{ id: "m1" }] : []),
    aiModelPrice: {
      findMany: async () => [{ inputPer1M: 0.2, outputPer1M: 1.2, cachedInputPer1M: 0.02, effectiveFrom: new Date("2026-01-01") }],
    },
    aiBudget: { findUnique: async () => ({ monthlyLimitUsd: 50 }) },
    aiRun: { create: async ({ data }: any) => { h.runs.push(data); return data; } },
  },
}));

import { POST } from "../src/app/api/projects/[id]/chapters/[chapterId]/scene-planner/route";

const call = () =>
  POST(new Request("http://x"), { params: Promise.resolve({ id: "p1", chapterId: "c1" }) });

describe("Scene Planner с AI Usage", () => {
  beforeEach(() => {
    h.reserveOk = true;
    h.usage = { input_tokens: 2000, output_tokens: 1000 };
    h.runs = [];
    h.settles = [];
    h.proposals = 0;
  });

  it("работает как раньше и записывает реальные токены и стоимость", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.proposals).toBe(1);
    expect(h.runs).toHaveLength(1);
    expect(h.runs[0]).toMatchObject({ roleKey: "SCENE_PLANNER", inputTokens: 2000, outputTokens: 1000 });
  });

  it("при исчерпанном лимите отвечает 429 и не создаёт Proposal", async () => {
    h.reserveOk = false;
    const res = await call();
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("BUDGET_EXCEEDED");
    expect(h.proposals).toBe(0);
    expect(h.runs).toHaveLength(0);
  });

  it("если провайдер не вернул usage, вызов проходит, стоимость неизвестна", async () => {
    h.usage = undefined;
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.runs[0].estimatedCost ?? null).toBeNull();
  });
});
