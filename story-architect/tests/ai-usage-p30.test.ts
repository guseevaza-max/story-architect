import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * p30: учёт расходов и месячный лимит в Writer, Revise, Architect, Memory и Lore.
 * Настоящие обработчики маршрутов; база, модель и авторизация заменены заглушками.
 * Платных запросов нет.
 */

const LUNA = { inputPer1M: 0.2, outputPer1M: 1.2, cachedInputPer1M: 0.02, effectiveFrom: new Date("2026-01-01") };

const h = vi.hoisted(() => ({
  reserveOk: true,
  reserves: [] as any[],
  settles: [] as any[],
  aiRuns: [] as any[],
  modelCalls: 0,
  usage: { input_tokens: 1000, output_tokens: 500 } as any,
  chatUsage: { prompt_tokens: 1000, completion_tokens: 500 } as any,
  text: "",
  json: "{}",
  fail: null as any,
  streamMode: "ok" as string,
  emitted: 0,
  completeUsage: { prompt_tokens: 1000, completion_tokens: 500 } as any,
  chapter: null as any,
}));

vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/context/storyState", () => ({
  buildStoryState: async () => "состояние",
  buildStoryStateWithStats: async () => ({
    text: "состояние",
    characters: 0,
    states: 0,
    relationships: 0,
  }),
  memoryChunksBefore: () => ({}),
}));
vi.mock("@/lib/authorIntent/load", () => ({ loadAuthorDirectionBlock: async () => "" }));

vi.mock("@/lib/ai/provider", () => {
  class AiProviderError extends Error {
    constructor(message: string, readonly status?: number) {
      super(message);
    }
  }
  const respond = () => {
    h.modelCalls++;
    if (h.fail) throw h.fail;
  };
  return {
    AiProviderError,
    redact: (v: string) => v,
    hasOpenAIKey: () => true,
    isMockMode: () => false,
    describeCompletionTarget: () => ({ provider: "openai", model: "gpt-x" }),
    complete: async () => {
      respond();
      return {
        text: JSON.stringify({ facts: [] }),
        model: "gpt-x",
        inputTokens: 1000,
        outputTokens: 500,
        cachedTokens: 0,
        estimatedCost: 0,
        durationMs: 1,
        rawUsage: h.completeUsage,
      };
    },
    getOpenAIClient: () => ({
      responses: {
        create: async () => {
          respond();
          return { output_text: h.text, usage: h.usage };
        },
        stream: () => {
          h.modelCalls++;
          let cb: (() => void) | null = null;
          return {
            on: (_e: string, fn: () => void) => void (cb = fn),
            finalResponse: async () => {
              if (h.streamMode === "fail-early") throw new Error("Connection error.");
              cb?.();
              h.emitted++;
              if (h.streamMode === "fail-late") throw new TypeError("terminated");
              if (h.streamMode === "abort-late") {
                const e = new Error("Request was aborted.");
                e.name = "APIUserAbortError";
                throw e;
              }
              return { output_text: "Доработанный текст.", usage: h.usage };
            },
          };
        },
      },
      chat: {
        completions: {
          create: async () => {
            respond();
            return { choices: [{ message: { content: h.json } }], usage: h.chatUsage };
          },
        },
      },
    }),
  };
});

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
              if (prop === "loreMaterial" && method === "findFirst")
                return { id: "m1", projectId: "p1", title: "Т", content: "Империя Пепла основана в 312 году." };
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
    ProposalOp: { CREATE: "CREATE", UPDATE: "UPDATE", DELETE: "DELETE" },
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

import { POST as writerPOST } from "../src/app/api/projects/[id]/chapters/[chapterId]/writer/route";
import { POST as revisePOST } from "../src/app/api/projects/[id]/chapters/[chapterId]/revise/route";
import { POST as architectPOST } from "../src/app/api/projects/[id]/chapters/[chapterId]/architect/route";
import { POST as memoryPOST } from "../src/app/api/projects/[id]/chapters/[chapterId]/memory/route";
import { POST as lorePOST } from "../src/app/api/projects/[id]/lore/[materialId]/extract/route";
import { runTrackedAiCall, type RunRecord, type TrackingDeps, type BudgetStore } from "../src/lib/ai/budget";
import { ROLE_ESTIMATES } from "../src/lib/ai/usage";

const plan = {
  chapterPurpose: "ц", initialState: "н", endState: "к",
  plotDevelopment: [], characterDevelopment: [], mustHappen: [], mustNotHappen: [], openQuestions: [],
};
const baseChapter = (over: any = {}) => ({
  id: "c1", bookId: "b1", number: 2, title: "Г", purpose: null, authorIdea: null, status: "DRAFT",
  plan, planApproved: true, finalText: null,
  draftText: "Салим вернулся домой.\n\nЗАМЫСЕЛ И МЫСЛИ\nУ Салима есть дочь Мира.",
  book: { id: "b1", number: 1, title: "Книга", projectId: "p1" },
  scenes: [{ id: "s", order: 1, title: "С", purpose: "ц", plan: "п", plannedOutcome: "р", status: "APPROVED" }],
  ...over,
});

const ctx = { params: Promise.resolve({ id: "p1", chapterId: "c1" }) };
const req = (body?: unknown) => new Request("http://t", { method: "POST", body: body ? JSON.stringify(body) : undefined });

type Route = { name: string; role: string; run: () => Promise<Response>; ownRun: boolean; prepare: () => void; failure: () => void };
const routes: Route[] = [
  {
    name: "Writer", role: "WRITER", ownRun: false,
    run: () => writerPOST(req(), ctx),
    prepare: () => { h.text = "Текст главы."; },
    failure: () => { h.fail = new Error("openai 500"); },
  },
  {
    name: "Revise", role: "REVISE", ownRun: false,
    run: () => revisePOST(req({}), ctx),
    prepare: () => { h.streamMode = "ok"; },
    failure: () => { h.streamMode = "fail-early"; },
  },
  {
    name: "Architect", role: "STORY_ARCHITECT", ownRun: true,
    run: () => architectPOST(req(), ctx),
    prepare: () => {
      h.chapter = baseChapter({ authorIdea: "Идея автора" });
      h.json = JSON.stringify(plan);
    },
    failure: () => { h.fail = new Error("openai 500"); },
  },
  {
    name: "Memory Extraction", role: "MEMORY_EXTRACTION", ownRun: true,
    run: () => memoryPOST(req(), ctx),
    prepare: () => {
      h.chapter = baseChapter({ status: "CANON", finalText: "Текст утверждённой главы." });
      h.text = JSON.stringify({ shortSummary: "к", fullSummary: "п", worldDelta: [], updates: [], characterProposals: [] });
    },
    failure: () => { h.fail = new Error("openai 500"); },
  },
  {
    name: "Lore Extraction", role: "LORE_EXTRACTION", ownRun: false,
    run: () => lorePOST(req(), { params: Promise.resolve({ id: "p1", materialId: "m1" }) }),
    prepare: () => {},
    failure: () => { h.fail = new Error("сеть"); },
  },
];

beforeEach(() => {
  h.reserveOk = true;
  h.reserves = [];
  h.settles = [];
  h.aiRuns = [];
  h.modelCalls = 0;
  h.usage = { input_tokens: 1000, output_tokens: 500 };
  h.chatUsage = { prompt_tokens: 1000, completion_tokens: 500 };
  h.completeUsage = { prompt_tokens: 1000, completion_tokens: 500 };
  h.fail = null;
  h.streamMode = "ok";
  h.emitted = 0;
  h.json = "{}";
  h.text = "";
  h.chapter = baseChapter();
});

describe.each(routes)("$name: учёт и лимит", (r) => {
  it("успех: ровно одна запись AiRun с реальными токенами и стоимостью", async () => {
    r.prepare();
    const res = await r.run();
    expect(res.status).toBe(200);
    expect(h.aiRuns).toHaveLength(1); // нет двойной записи
    const run = h.aiRuns[0];
    expect(run.roleKey).toBe(r.role);
    expect(run.inputTokens).toBe(1000);
    expect(run.outputTokens).toBe(500);
    expect(run.costStatus).toBe("KNOWN");
    // 1000*0.2/1e6 + 500*1.2/1e6 = 0.0008
    expect(Number(run.estimatedCost)).toBeCloseTo(0.0008, 6);
    // резерв снят, фактический расход записан
    expect(h.settles).toHaveLength(1);
    expect(Number(h.settles[0][3])).toBeCloseTo(0.0008, 6);
  });

  it("лимит исчерпан: 429, модель не вызвана, записей нет", async () => {
    r.prepare();
    h.reserveOk = false;
    const res = await r.run();
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("BUDGET_EXCEEDED");
    expect(h.modelCalls).toBe(0);
    expect(h.aiRuns).toHaveLength(0);
    expect(h.settles).toHaveLength(0);
  });

  it("резерв берётся ДО вызова модели, по оценке роли", async () => {
    r.prepare();
    await r.run();
    expect(h.reserves).toHaveLength(1);
    const est = ROLE_ESTIMATES[r.role]!;
    const expected = (est.inputTokens * 0.2 + est.outputTokens * 1.2) / 1e6;
    expect(Number(h.reserves[0][2])).toBeCloseTo(expected, 5);
  });

  it("нет usage: стоимость неизвестна, в лимит по резерву, не ноль", async () => {
    r.prepare();
    h.usage = undefined;
    h.chatUsage = undefined;
    h.completeUsage = undefined;
    const res = await r.run();
    expect(res.status).toBe(200);
    const run = h.aiRuns[0];
    expect(run.costStatus).toBe("UNKNOWN");
    expect(run.estimatedCost ?? null).toBeNull();
    expect(Number(h.settles[0][4])).toBeGreaterThan(0); // assumedUsd
    expect(Number(h.settles[0][3])).toBe(0);
  });

  it("ошибка провайдера: резерв освобождён, ничего не потрачено", async () => {
    r.prepare();
    r.failure();
    const res = await r.run();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(h.settles).toHaveLength(1);
    expect(Number(h.settles[0][3]) + Number(h.settles[0][4])).toBe(0);
    // Свои AiRun Architect и Memory пишут только при успехе, остальные фиксируют FAILED.
    if (r.ownRun) expect(h.aiRuns).toHaveLength(0);
    else {
      expect(h.aiRuns).toHaveLength(1);
      expect(h.aiRuns[0].status).toBe("FAILED");
    }
  });
});

describe("Revise: потоковый учёт", () => {
  const prep = () => {
    h.chapter = baseChapter();
  };

  it("обрыв после начала ответа: учитывается по резерву, не как ноль", async () => {
    prep();
    h.streamMode = "fail-late";
    const res = await revisePOST(req({}), ctx);
    expect(res.status).toBe(502);
    expect(h.emitted).toBe(1);
    expect(Number(h.settles[0][4])).toBeGreaterThan(0); // assumedUsd = резерв
    expect(h.settles[0][5]).toBe(1); // вызов с неизвестной стоимостью
    expect(h.aiRuns[0]).toMatchObject({ status: "FAILED", costStatus: "UNKNOWN" });
    expect(h.aiRuns[0].costNote).toContain("резерв");
    // Оценка записана отдельно и не выдаётся за фактическую стоимость.
    expect(h.aiRuns[0].estimatedCost ?? null).toBeNull();
    expect(Number(h.aiRuns[0].assumedCost)).toBeGreaterThan(0);
  });

  it("отмена запроса после начала ответа: так же по резерву", async () => {
    prep();
    h.streamMode = "abort-late";
    const res = await revisePOST(req({}), ctx);
    expect(res.status).toBe(500);
    expect(Number(h.settles[0][4])).toBeGreaterThan(0);
    expect(h.aiRuns[0].costStatus).toBe("UNKNOWN");
  });

  it("сбой до первого события: провайдер ничего не обработал, резерв освобождён без списания", async () => {
    prep();
    h.streamMode = "fail-early";
    await revisePOST(req({}), ctx);
    expect(Number(h.settles[0][4])).toBe(0);
    expect(h.settles[0][5]).toBe(0);
    expect(h.aiRuns[0].status).toBe("FAILED");
  });

  it("успешный поток остаётся потоковым и пишет реальные токены", async () => {
    prep();
    const res = await revisePOST(req({}), ctx);
    expect(res.status).toBe(200);
    expect(h.emitted).toBe(1);
    expect(h.aiRuns[0].inputTokens).toBe(1000);
  });
});

describe("обёртка: skipRecord и onResult", () => {
  const mk = (): { deps: TrackingDeps; recorded: RunRecord[] } => {
    const recorded: RunRecord[] = [];
    const store: BudgetStore = { reserve: async () => ({ ok: true }), settle: async () => {} };
    return {
      recorded,
      deps: {
        store,
        findPrice: async () => LUNA,
        getLimitUsd: async () => 50,
        recordRun: async (r) => void recorded.push(r),
        now: () => new Date("2026-11-05T00:00:00Z"),
        failClosed: false,
        defaultLimitUsd: 50,
        log: () => {},
      },
    };
  };
  const o = { userId: "u", projectId: "p", roleKey: "WRITER", provider: "openai", model: "m" };

  it("skipRecord не пишет строку, но отдаёт итог через onResult ровно один раз", async () => {
    const { deps, recorded } = mk();
    const seen: RunRecord[] = [];
    await runTrackedAiCall(deps, { ...o, skipRecord: true, onResult: (r) => seen.push(r) }, async () => ({
      value: 1,
      usage: { input_tokens: 10, output_tokens: 5 },
    }));
    expect(recorded).toHaveLength(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ costStatus: "KNOWN", inputTokens: 10 });
  });

  it("без skipRecord строка пишется один раз", async () => {
    const { deps, recorded } = mk();
    await runTrackedAiCall(deps, o, async () => ({ value: 1, usage: null }));
    expect(recorded).toHaveLength(1);
  });

  it("сбой onResult не ломает вызов", async () => {
    const { deps } = mk();
    const v = await runTrackedAiCall(
      deps,
      { ...o, onResult: () => { throw new Error("x"); } },
      async () => ({ value: 7, usage: null })
    );
    expect(v).toBe(7);
  });
});
