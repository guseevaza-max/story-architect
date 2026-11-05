import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * p31: Continuity (проверка, предложения, применение) и Story Bible Analyze
 * под учётом расходов, лимитом бюджета и потолками токенов.
 * Настоящие обработчики; база, модель и авторизация заменены заглушками.
 */

const LUNA = { inputPer1M: 0.2, outputPer1M: 1.2, cachedInputPer1M: 0.02, effectiveFrom: new Date("2026-01-01") };

const h = vi.hoisted(() => ({
  reserveOk: true,
  reserves: [] as any[],
  settles: [] as any[],
  aiRuns: [] as any[],
  requests: [] as any[],
  modelCalls: 0,
  usage: undefined as any,
  chatUsage: undefined as any,
  fail: null as any,
  output: "{}",
  chapter: null as any,
}));

vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/context/storyState", () => ({
  buildStoryState: async () => "состояние",
  memoryChunksBefore: () => ({}),
}));
vi.mock("@/lib/authorIntent/load", () => ({ loadAuthorDirectionBlock: async () => "" }));
vi.mock("@/lib/ai/provider", () => ({
  hasOpenAIKey: () => true,
  getOpenAIClient: () => ({
    responses: {
      create: async (req: any) => {
        h.requests.push(req);
        h.modelCalls++;
        if (h.fail) throw h.fail;
        return { output_text: h.output, usage: h.usage };
      },
    },
    chat: {
      completions: {
        create: async (req: any) => {
          h.requests.push(req);
          h.modelCalls++;
          if (h.fail) throw h.fail;
          return { choices: [{ message: { content: h.output } }], usage: h.chatUsage };
        },
      },
    },
  }),
}));

vi.mock("@prisma/client", () => {
  const client: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "$executeRawUnsafe")
          return async (sql: string, ...args: any[]) => {
            if (sql.includes("GREATEST")) h.settles.push(args);
            return 1;
          };
        if (prop === "$queryRawUnsafe")
          return async (_sql: string, ...args: any[]) => {
            h.reserves.push(args);
            return h.reserveOk ? [{ id: "m" }] : [];
          };
        if (prop === "$transaction") return async (a: any) => (typeof a === "function" ? a(client) : Promise.all(a));
        if (prop === "$disconnect") return async () => undefined;
        return new Proxy(
          {},
          {
            get: (_t2, method: string) => async (args: any) => {
              if (prop === "aiModelPrice" && method === "findMany") return [LUNA];
              if (prop === "aiBudget" && method === "findUnique") return { monthlyLimitUsd: 50 };
              if (prop === "aiRun" && method === "create") {
                h.aiRuns.push(args.data);
                return { id: `run-${h.aiRuns.length}`, ...args.data };
              }
              if (prop === "project" && (method === "findFirst" || method === "findUnique")) return { id: "p1", name: "Параллакс" };
              if (prop === "chapter" && (method === "findFirst" || method === "findUnique")) {
                if (args?.where?.number?.lt !== undefined) return null;
                return h.chapter;
              }
              if (prop === "continuityReport" && method === "findFirst")
                return { id: "r1", issues: [{ id: "i1", title: "Проблема", category: "c", alertType: "ERROR", priority: "CRITICAL", evidence: [], explanations: {}, suggestedResolutions: [] }] };
              if (method === "findMany") return [];
              if (method === "count") return 0;
              if (method === "updateMany" || method === "deleteMany") return { count: 0 };
              if (method === "findFirst" || method === "findUnique") return null;
              return { id: `${prop}-id`, ...(args?.data ?? {}) };
            },
          }
        );
      },
    }
  );
  return {
    Prisma: { JsonNull: "__JsonNull__", DbNull: "__DbNull__" },
    AiRunStatus: { SUCCESS: "SUCCESS", FAILED: "FAILED" },
    PrismaClient: class {
      constructor() {
        return client;
      }
    },
  };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient() };
});

import { POST as continuityPOST } from "../src/app/api/projects/[id]/chapters/[chapterId]/continuity/route";
import { POST as suggestionsPOST } from "../src/app/api/projects/[id]/chapters/[chapterId]/continuity/suggestions/route";
import { POST as applyPOST } from "../src/app/api/projects/[id]/chapters/[chapterId]/continuity/apply-suggestions/route";
import { POST as analyzePOST } from "../src/app/api/ai/analyze/route";
import { AI_LIMITS, estimateTokens, inputEstimate, InputTooLargeError, limitsFor } from "../src/lib/ai/limits";
import { ROLE_ESTIMATES, aggregateUsage } from "../src/lib/ai/usage";

const chapterRow = (draft = "Салим вернулся домой.") => ({
  id: "c1", bookId: "b1", number: 2, title: "Г", purpose: "ц", authorIdea: "и", status: "DRAFT",
  plan: { a: 1 }, planApproved: true, draftText: draft,
  book: { id: "b1", number: 1, title: "Книга", projectId: "p1" },
  scenes: [],
});
const ctx = { params: Promise.resolve({ id: "p1", chapterId: "c1" }) };
const post = (body?: unknown) => new Request("http://t", { method: "POST", body: body ? JSON.stringify(body) : undefined });
const selection = { issueId: "i1", problemTitle: "П", suggestion: { title: "т", explanation: "о", changes: ["х"], excerpt: "э" } };

type R = { name: string; role: string; capKey: "max_output_tokens" | "max_completion_tokens"; run: (draft?: string) => Promise<Response>; ok: () => void };
const routes: R[] = [
  {
    name: "Continuity", role: "CONTINUITY_CHECK", capKey: "max_output_tokens",
    run: (d) => { h.chapter = chapterRow(d); return continuityPOST(post(), ctx); },
    ok: () => { h.output = JSON.stringify({ status: "PASS", issues: [], summary: { text: "ok" } }); },
  },
  {
    name: "Continuity suggestions", role: "CONTINUITY_SUGGESTIONS", capKey: "max_completion_tokens",
    run: (d) => { h.chapter = chapterRow(d); return suggestionsPOST(post(), ctx); },
    ok: () => { h.output = JSON.stringify({ suggestions: [] }); },
  },
  {
    name: "Continuity apply", role: "CONTINUITY_APPLY", capKey: "max_completion_tokens",
    run: (d) => { h.chapter = chapterRow(d); return applyPOST(post({ selections: [selection] }), ctx); },
    ok: () => { h.output = JSON.stringify({ revisedDraft: "Новый текст.", changeSummary: "с" }); },
  },
  {
    name: "Story Bible Analyze", role: "STORY_BIBLE_ANALYZE", capKey: "max_output_tokens",
    run: (d) => analyzePOST(post({ text: d ?? "Империя Пепла.", projectId: "p1" })),
    ok: () => { h.output = JSON.stringify({ facts: [] }); },
  },
];

beforeEach(() => {
  h.reserveOk = true; h.reserves = []; h.settles = []; h.aiRuns = []; h.requests = [];
  h.modelCalls = 0; h.fail = null;
  h.usage = { input_tokens: 1000, output_tokens: 500 };
  h.chatUsage = { prompt_tokens: 1000, completion_tokens: 500 };
});

describe.each(routes)("$name", (r) => {
  it("успех: одна запись AiRun с реальными токенами и стоимостью, оценка не используется", async () => {
    r.ok();
    const res = await r.run();
    expect(res.status).toBe(200);
    expect(h.aiRuns).toHaveLength(1);
    expect(h.aiRuns[0]).toMatchObject({ roleKey: r.role, inputTokens: 1000, outputTokens: 500, costStatus: "KNOWN" });
    expect(Number(h.aiRuns[0].estimatedCost)).toBeCloseTo(0.0008, 6);
    expect(h.aiRuns[0].assumedCost ?? null).toBeNull();
  });

  it("в запросе к модели стоит потолок длины ответа из лимитов роли", async () => {
    r.ok();
    await r.run();
    expect(h.requests[0][r.capKey]).toBe(limitsFor(r.role).maxOutputTokens);
  });

  it("лимит исчерпан: 429, модель не вызвана, записей нет", async () => {
    r.ok();
    h.reserveOk = false;
    const res = await r.run();
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("BUDGET_EXCEEDED");
    expect(h.modelCalls).toBe(0);
    expect(h.aiRuns).toHaveLength(0);
  });

  it("слишком большой вход: 413 до резерва и до платного вызова", async () => {
    r.ok();
    const huge = "а".repeat(limitsFor(r.role).maxInputTokens * 2 + 10);
    const res = await r.run(huge);
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("INPUT_TOO_LARGE");
    expect(h.reserves).toHaveLength(0);
    expect(h.modelCalls).toBe(0);
  });

  it("резерв считается по реальному размеру запроса и потолку ответа", async () => {
    r.ok();
    await r.run("а".repeat(20_000));
    const reserve = Number(h.reserves[0][2]);
    const out = limitsFor(r.role).maxOutputTokens;
    // вход ≥ 10 тыс. токенов (20 тыс. символов / 2) + выход по потолку
    expect(reserve).toBeGreaterThanOrEqual((10_000 * 0.2 + out * 1.2) / 1e6 - 1e-6);
  });

  it("нет usage: фактическая стоимость неизвестна, оценка для лимита записана отдельно", async () => {
    r.ok();
    h.usage = undefined;
    h.chatUsage = undefined;
    const res = await r.run();
    expect(res.status).toBe(200);
    const run = h.aiRuns[0];
    expect(run.costStatus).toBe("UNKNOWN");
    expect(run.estimatedCost ?? null).toBeNull(); // не показываем оценку как факт
    expect(Number(run.assumedCost)).toBeGreaterThan(0); // но в лимит она учтена
    expect(Number(h.settles[0][3])).toBe(0); // фактически потрачено
    expect(Number(h.settles[0][4])).toBeGreaterThan(0); // оценка для лимита
  });

  it("ошибка провайдера: резерв освобождён, фактический расход ноль, FAILED без оценки", async () => {
    r.ok();
    h.fail = new Error("openai 500");
    const res = await r.run();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(Number(h.settles[0][3]) + Number(h.settles[0][4])).toBe(0);
    expect(h.aiRuns).toHaveLength(1);
    expect(h.aiRuns[0]).toMatchObject({ status: "FAILED" });
    expect(h.aiRuns[0].assumedCost ?? null).toBeNull();
  });
});

describe("лимиты токенов", () => {
  it("у каждой роли с вызовом модели есть лимиты, резерв по выходу равен потолку", () => {
    for (const [role, l] of Object.entries(AI_LIMITS)) {
      expect(l.maxInputTokens).toBeGreaterThan(l.typicalInputTokens);
      expect(ROLE_ESTIMATES[role]!.outputTokens).toBe(l.maxOutputTokens);
    }
  });
  it("оценка токенов консервативна, вход выше предела отклоняется", () => {
    expect(estimateTokens("абвг")).toBe(2);
    expect(() => inputEstimate("STORY_BIBLE_ANALYZE", "а".repeat(200_000))).toThrow(InputTooLargeError);
    expect(inputEstimate("STORY_BIBLE_ANALYZE", "текст").outputTokens).toBe(12_000);
  });
});

describe("отчёт: факт и оценка раздельно", () => {
  it("assumedCost суммируется отдельно и не попадает в фактическую стоимость", () => {
    const row = (o: any) => ({
      createdAt: new Date("2026-11-05T10:00:00Z"), projectId: "p", roleKey: "WRITER", model: "m", provider: "openai",
      status: "SUCCESS", inputTokens: 1, outputTokens: 1, cachedTokens: 0, estimatedCost: null, assumedCost: null, ...o,
    });
    const r = aggregateUsage([row({ estimatedCost: 0.5 }), row({ assumedCost: 0.04 }), row({ status: "FAILED", assumedCost: 0.04 })]);
    expect(r.total.knownCostUsd).toBe(0.5);
    expect(r.total.assumedCostUsd).toBe(0.08);
    expect(r.total.unknownCostCalls).toBe(1);
  });
});
