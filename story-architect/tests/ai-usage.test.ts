import { describe, expect, it } from "vitest";
import {
  FALLBACK_RESERVE_USD,
  aggregateUsage,
  computeCost,
  estimateReserveUsd,
  monthKey,
  normalizeUsage,
  pickPrice,
  ROLE_ESTIMATES,
  type ModelPrice,
  type UsageRow,
} from "../src/lib/ai/usage";
import {
  BudgetExceededError,
  runTrackedAiCall,
  type BudgetStore,
  type RunRecord,
  type TrackingDeps,
} from "../src/lib/ai/budget";
import { parseMonth, monthRange } from "../src/lib/ai/usageReport";

const luna: ModelPrice = { inputPer1M: 0.2, outputPer1M: 1.2, cachedInputPer1M: 0.02, effectiveFrom: new Date("2026-01-01") };

describe("normalizeUsage", () => {
  it("понимает формат Responses API", () => {
    expect(
      normalizeUsage({ input_tokens: 1000, output_tokens: 500, input_tokens_details: { cached_tokens: 200 } })
    ).toEqual({ inputTokens: 1000, outputTokens: 500, cachedTokens: 200 });
  });
  it("понимает формат Chat Completions", () => {
    expect(
      normalizeUsage({ prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } })
    ).toEqual({ inputTokens: 10, outputTokens: 5, cachedTokens: 4 });
  });
  it("отсутствие usage или неполные данные дают null, а не нули", () => {
    expect(normalizeUsage(undefined)).toBeNull();
    expect(normalizeUsage(null)).toBeNull();
    expect(normalizeUsage({})).toBeNull();
    expect(normalizeUsage({ input_tokens: 5 })).toBeNull();
    expect(normalizeUsage({ input_tokens: -1, output_tokens: 2 })).toBeNull();
  });
  it("кэш не может превышать вход", () => {
    expect(normalizeUsage({ input_tokens: 10, output_tokens: 1, input_tokens_details: { cached_tokens: 99 } })?.cachedTokens).toBe(10);
  });
});

describe("computeCost", () => {
  it("считает вход, кэш и выход отдельно", () => {
    const r = computeCost({ inputTokens: 1_000_000, outputTokens: 1_000_000, cachedTokens: 500_000 }, luna);
    // 0.5M*0.2 + 0.5M*0.02 + 1M*1.2
    expect(r).toEqual({ status: "KNOWN", costUsd: 1.31 });
  });
  it("без тарифа кэша кэш считается по цене входа", () => {
    const r = computeCost(
      { inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 1_000_000 },
      { ...luna, cachedInputPer1M: null }
    );
    expect(r).toEqual({ status: "KNOWN", costUsd: 0.2 });
  });
  it("нет usage: стоимость неизвестна, не ноль", () => {
    expect(computeCost(null, luna)).toEqual({ status: "UNKNOWN", reason: "NO_USAGE" });
  });
  it("нет тарифа: стоимость неизвестна", () => {
    expect(computeCost({ inputTokens: 1, outputTokens: 1, cachedTokens: 0 }, null)).toEqual({
      status: "UNKNOWN",
      reason: "NO_PRICE",
    });
  });
  it("реальные нулевые токены дают известный ноль", () => {
    expect(computeCost({ inputTokens: 0, outputTokens: 0, cachedTokens: 0 }, luna)).toEqual({ status: "KNOWN", costUsd: 0 });
  });
});

describe("pickPrice, monthKey, резерв", () => {
  it("выбирает последний действующий тариф и не берёт будущий", () => {
    const rows = [
      { effectiveFrom: new Date("2026-01-01"), v: 1 },
      { effectiveFrom: new Date("2026-06-01"), v: 2 },
      { effectiveFrom: new Date("2027-01-01"), v: 3 },
    ];
    expect(pickPrice(rows, new Date("2026-07-01"))?.v).toBe(2);
    expect(pickPrice(rows, new Date("2025-01-01"))).toBeNull();
  });
  it("месяц по UTC", () => {
    expect(monthKey(new Date("2026-11-30T23:59:59Z"))).toBe("2026-11");
    expect(monthKey(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12");
  });
  it("резерв по тарифу и запасной без тарифа", () => {
    expect(estimateReserveUsd(luna, { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(1.4);
    expect(estimateReserveUsd(null, { inputTokens: 1, outputTokens: 1 })).toBe(FALLBACK_RESERVE_USD);
  });
  it("parseMonth и monthRange", () => {
    expect(parseMonth("2026-03")).toBe("2026-03");
    expect(parseMonth("мусор", new Date("2026-11-05T00:00:00Z"))).toBe("2026-11");
    expect(monthRange("2026-12").end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

// ───────────── обёртка с хранилищем в памяти ─────────────

function memoryStore(limit: number) {
  const s = { spent: 0, assumed: 0, reserved: 0, unknown: 0, calls: 0, accepted: 0 };
  const store: BudgetStore = {
    async reserve({ amountUsd }) {
      // Проверка и увеличение в одном синхронном блоке, как один SQL UPDATE.
      if (s.spent + s.assumed + s.reserved + amountUsd <= limit + 1e-12) {
        s.reserved += amountUsd;
        s.accepted += 1;
        return { ok: true };
      }
      return { ok: false };
    },
    async settle(a) {
      s.reserved = Math.max(s.reserved - a.reservedUsd, 0);
      s.spent += a.spentUsd;
      s.assumed += a.assumedUsd;
      s.unknown += a.unknownCost ? 1 : 0;
      s.calls += a.countCall ? 1 : 0;
    },
  };
  return { s, store };
}

function makeDeps(over: Partial<TrackingDeps> & { limit?: number; price?: ModelPrice | null } = {}) {
  const { s, store } = memoryStore(over.limit ?? 50);
  const runs: RunRecord[] = [];
  const logs: string[] = [];
  const deps: TrackingDeps = {
    store,
    findPrice: async () => (over.price === undefined ? luna : over.price),
    getLimitUsd: async () => over.limit ?? 50,
    recordRun: async (r) => {
      runs.push(r);
    },
    now: () => new Date("2026-11-05T10:00:00Z"),
    failClosed: false,
    defaultLimitUsd: 50,
    log: (m) => logs.push(m),
    ...over,
  };
  delete (over as any).limit;
  return { deps, s, runs, logs };
}

const opts = { userId: "u", projectId: "p", roleKey: "SCENE_PLANNER", provider: "openai", model: "luna" };
const okCall = (usage: unknown) => async () => ({ value: "ответ", usage });

describe("runTrackedAiCall", () => {
  it("записывает реальные токены и стоимость, снимает резерв", async () => {
    const { deps, s, runs } = makeDeps();
    const v = await runTrackedAiCall(deps, opts, okCall({ input_tokens: 1_000_000, output_tokens: 100_000 }));
    expect(v).toBe("ответ");
    expect(runs[0]).toMatchObject({ status: "SUCCESS", costStatus: "KNOWN", inputTokens: 1_000_000, estimatedCostUsd: 0.32 });
    expect(s.spent).toBeCloseTo(0.32, 6);
    expect(s.reserved).toBe(0);
    expect(s.calls).toBe(1);
  });

  it("нет usage: стоимость неизвестна, в лимит идёт по резерву", async () => {
    const { deps, s, runs } = makeDeps();
    await runTrackedAiCall(deps, opts, okCall(undefined));
    expect(runs[0]).toMatchObject({ costStatus: "UNKNOWN", estimatedCostUsd: null, inputTokens: null });
    expect(s.spent).toBe(0);
    expect(s.assumed).toBeGreaterThan(0);
    expect(s.unknown).toBe(1);
    expect(s.reserved).toBe(0);
  });

  it("нет тарифа: стоимость неизвестна, токены сохранены", async () => {
    const { deps, runs, s } = makeDeps({ price: null });
    await runTrackedAiCall(deps, opts, okCall({ input_tokens: 5, output_tokens: 5 }));
    expect(runs[0]).toMatchObject({ costStatus: "UNKNOWN", estimatedCostUsd: null, inputTokens: 5 });
    expect(s.assumed).toBe(FALLBACK_RESERVE_USD);
  });

  it("при ошибке вызова резерв освобождается, пишется FAILED, ошибка пробрасывается", async () => {
    const { deps, s, runs } = makeDeps();
    await expect(
      runTrackedAiCall(deps, opts, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(s.reserved).toBe(0);
    expect(s.spent + s.assumed).toBe(0);
    expect(runs[0]).toMatchObject({ status: "FAILED", errorMessage: "boom" });
  });

  it("параллельные запросы: принято ровно столько, сколько влезает в лимит", async () => {
    const reserve = estimateReserveUsd(luna, ROLE_ESTIMATES.SCENE_PLANNER!);
    const limit = reserve * 5 + reserve / 2; // влезает 5
    const { deps, s } = makeDeps({ limit });
    let executed = 0;
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        runTrackedAiCall(deps, opts, async () => {
          executed += 1;
          await new Promise((r) => setTimeout(r, 5));
          return { value: 1, usage: undefined };
        })
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const blocked = results.filter((r) => r.status === "rejected" && r.reason instanceof BudgetExceededError).length;
    expect(ok).toBe(5);
    expect(blocked).toBe(15);
    expect(executed).toBe(5);
    expect(s.spent + s.assumed + s.reserved).toBeLessThanOrEqual(limit);
  });

  it("исчерпанный лимит блокирует вызов до обращения к модели", async () => {
    const { deps } = makeDeps({ limit: 0.001 });
    let called = false;
    await expect(
      runTrackedAiCall(deps, opts, async () => {
        called = true;
        return { value: 1, usage: null };
      })
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(called).toBe(false);
  });

  it("поломка учёта: вызов выполняется (fail-open), в строгом режиме нет", async () => {
    const broken: BudgetStore = {
      reserve: async () => {
        throw new Error("table missing");
      },
      settle: async () => {
        throw new Error("never");
      },
    };
    const open = makeDeps({ store: broken });
    expect(await runTrackedAiCall(open.deps, opts, okCall({ input_tokens: 1, output_tokens: 1 }))).toBe("ответ");
    expect(open.logs.length).toBeGreaterThan(0);

    const strict = makeDeps({ store: broken, failClosed: true });
    let called = false;
    await expect(
      runTrackedAiCall(strict.deps, opts, async () => {
        called = true;
        return { value: 1, usage: null };
      })
    ).rejects.toThrow("table missing");
    expect(called).toBe(false);
  });

  it("сбой записи AiRun не ломает генерацию", async () => {
    const { deps } = makeDeps({
      recordRun: async () => {
        throw new Error("db down");
      },
    });
    expect(await runTrackedAiCall(deps, opts, okCall({ input_tokens: 1, output_tokens: 1 }))).toBe("ответ");
  });

  it("месяц берётся по UTC на момент старта", async () => {
    let seen = "";
    const { deps } = makeDeps({
      now: () => new Date("2026-12-31T23:59:00Z"),
      store: {
        reserve: async (a) => {
          seen = a.period;
          return { ok: true };
        },
        settle: async () => {},
      },
    });
    await runTrackedAiCall(deps, opts, okCall(null));
    expect(seen).toBe("2026-12");
  });
});

describe("aggregateUsage", () => {
  const row = (o: Partial<UsageRow>): UsageRow => ({
    createdAt: new Date("2026-11-05T10:00:00Z"),
    projectId: "p1",
    roleKey: "SCENE_PLANNER",
    model: "luna",
    provider: "openai",
    status: "SUCCESS",
    inputTokens: 100,
    outputTokens: 50,
    cachedTokens: 10,
    estimatedCost: 0.01,
    ...o,
  });

  it("группирует по функции, модели, дню и проекту; неизвестное не превращает в ноль", () => {
    const r = aggregateUsage([
      row({}),
      row({ estimatedCost: null, inputTokens: null, outputTokens: null, cachedTokens: null }),
      row({ roleKey: "ARCHITECT", projectId: "p2", createdAt: new Date("2026-11-06T01:00:00Z"), estimatedCost: 0.5 }),
      row({ status: "FAILED", estimatedCost: null }),
    ]);
    expect(r.total).toMatchObject({ calls: 4, failedCalls: 1, unknownCostCalls: 1, knownCostUsd: 0.51 });
    expect(r.byRole.map((g) => g.key)).toEqual(["ARCHITECT", "SCENE_PLANNER"]);
    expect(r.byDay.map((g) => g.key)).toEqual(["2026-11-05", "2026-11-06"]);
    expect(r.byProject).toHaveLength(2);
    expect(r.byModel[0]?.key).toBe("openai / luna");
    expect(aggregateUsage([row({ provider: null })]).byModel[0]?.key).toBe("провайдер не указан / luna");
  });
});
