import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  BudgetExceededError,
  createPrismaTrackingDeps,
  runTrackedAiCall,
  type BudgetStore,
  type TrackingDeps,
} from "../src/lib/ai/budget";
import { ROLE_ESTIMATES, computeCost, estimateReserveUsd, normalizeUsage } from "../src/lib/ai/usage";

const lunaPrice = { inputPer1M: 0.2, outputPer1M: 1.2, cachedInputPer1M: 0.02, effectiveFrom: new Date("2026-01-01") };
const RESERVE = estimateReserveUsd(lunaPrice, ROLE_ESTIMATES.SCENE_PLANNER!);

/** Аудит AI Usage: сценарии, на которых учёт мог бы тихо сломаться. */

const opts = { userId: "u", projectId: "p", roleKey: "SCENE_PLANNER", provider: "openai", model: "m" };

function deps(limit: number, price: any, runs: any[] = []): TrackingDeps {
  const s = { used: 0, reserved: 0 };
  const store: BudgetStore = {
    async reserve({ amountUsd }) {
      if (s.used + s.reserved + amountUsd <= limit + 1e-12) {
        s.reserved += amountUsd;
        return { ok: true };
      }
      return { ok: false };
    },
    async settle(a) {
      s.reserved -= a.reservedUsd;
      s.used += a.spentUsd + a.assumedUsd;
    },
  };
  return {
    store,
    findPrice: async () => price,
    getLimitUsd: async () => limit,
    recordRun: async (r) => void runs.push(r),
    now: () => new Date("2026-11-05T00:00:00Z"),
    failClosed: false,
    defaultLimitUsd: limit,
    log: () => {},
  };
}
const luna = { inputPer1M: 0.2, outputPer1M: 1.2, cachedInputPer1M: 0.02, effectiveFrom: new Date("2026-01-01") };

describe("старые записи: почему стоимость неизвестна", () => {
  it("токены есть, но без записанной стоимости новый код не выдумывает её", () => {
    // Так выглядела запись Architect до p29: токены есть, цены в записи нет.
    const usage = normalizeUsage({ prompt_tokens: 63120, completion_tokens: 8429 });
    expect(usage).not.toBeNull();
    // Стоимость можно получить только расчётом по тарифу; без него она неизвестна.
    expect(computeCost(usage, null)).toEqual({ status: "UNKNOWN", reason: "NO_PRICE" });
  });
});

describe("неизвестная стоимость и лимит", () => {
  it("вызовы без usage не бесплатны: серия таких вызовов упирается в лимит", async () => {
    const d = deps(RESERVE * 3.5, luna);
    let ok = 0;
    for (let i = 0; i < 10; i++) {
      try {
        await runTrackedAiCall(d, opts, async () => ({ value: 1, usage: undefined }));
        ok++;
      } catch (e) {
        expect(e).toBeInstanceOf(BudgetExceededError);
      }
    }
    expect(ok).toBe(3); // 3 резерва помещаются, 4-й нет
  });

  it("то же без тарифа: резерв-запас, а не ноль", async () => {
    const d = deps(0.25, null);
    let ok = 0;
    for (let i = 0; i < 10; i++) {
      try {
        await runTrackedAiCall(d, opts, async () => ({ value: 1, usage: { input_tokens: 1, output_tokens: 1 } }));
        ok++;
      } catch {
        /* лимит */
      }
    }
    expect(ok).toBe(2); // запасной резерв 0.1
  });

  it("известная малая стоимость освобождает остаток резерва", async () => {
    // Фактически ~0.0003 на вызов. Если бы резерв не освобождался,
    // второй вызов уже упёрся бы в лимит 1.5 резерва.
    const d = deps(RESERVE * 1.5, luna);
    for (let i = 0; i < 10; i++) {
      await runTrackedAiCall(d, opts, async () => ({ value: 1, usage: { input_tokens: 1000, output_tokens: 100 } }));
    }
  });
});

describe("сопоставление тарифа по паре provider/model", () => {
  it("запрос тарифа содержит и провайдера, и модель, и дату", async () => {
    let where: any;
    const prisma: any = {
      aiModelPrice: {
        findMany: async (q: any) => {
          where = q;
          return [];
        },
      },
    };
    const d = createPrismaTrackingDeps(prisma);
    const at = new Date("2026-11-05T10:00:00Z");
    expect(await d.findPrice("openrouter", "openai/gpt-5.6-luna", at)).toBeNull();
    expect(where.where).toEqual({ provider: "openrouter", model: "openai/gpt-5.6-luna", effectiveFrom: { lte: at } });
    expect(where.orderBy).toEqual({ effectiveFrom: "desc" });
  });
});

describe("записи AiRun не меняются и не удаляются", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
    });

  it("в коде нет update/delete для AiRun", () => {
    for (const f of walk("src")) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/aiRun\.(update|updateMany|delete|deleteMany|upsert)\b/);
    }
  });

  it("миграция AI Usage только добавляет колонки и ничего не меняет в AiRun", () => {
    const sql = readFileSync("prisma/migrations/0006_ai_usage/migration.sql", "utf8");
    expect(sql).not.toMatch(/UPDATE\s+"AiRun"|DELETE\s+FROM\s+"AiRun"|DROP\s+(TABLE|COLUMN)|TRUNCATE/i);
    expect(sql).toMatch(/ALTER TABLE "AiRun" ADD COLUMN/);
  });
});

describe("реестр ИИ-маршрутов", () => {
  // Любой новый файл с вызовом модели должен быть внесён сюда сознательно.
  // tracked = защищён бюджетом и пишет стоимость через runTrackedAiCall.
  const REGISTRY: Record<string, boolean> = {
    "src/app/api/ai/analyze/route.ts": true,
    "src/app/api/projects/[id]/chapters/[chapterId]/architect/route.ts": true,
    "src/app/api/projects/[id]/chapters/[chapterId]/continuity/apply-suggestions/route.ts": true,
    "src/app/api/projects/[id]/chapters/[chapterId]/continuity/route.ts": true,
    "src/app/api/projects/[id]/chapters/[chapterId]/continuity/suggestions/route.ts": true,
    "src/app/api/projects/[id]/chapters/[chapterId]/memory/route.ts": true,
    "src/app/api/projects/[id]/chapters/[chapterId]/revise/route.ts": true,
    "src/app/api/projects/[id]/chapters/[chapterId]/scene-planner/route.ts": true,
    "src/app/api/projects/[id]/chapters/[chapterId]/writer/route.ts": true,
    "src/app/api/projects/[id]/lore/[materialId]/extract/route.ts": true,
  };
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
    });
  const callers = walk("src/app").filter((f) =>
    /responses\.(create|stream)\(|chat\.completions\.create\(|\bcomplete\(/.test(readFileSync(f, "utf8"))
  );

  it("все маршруты с вызовом модели учтены в реестре", () => {
    expect(callers.map((f) => f.replace(/\\/g, "/")).sort()).toEqual(Object.keys(REGISTRY).sort());
  });

  it("помеченные как защищённые действительно используют runTrackedAiCall", () => {
    for (const [file, tracked] of Object.entries(REGISTRY)) {
      expect(readFileSync(file, "utf8").includes("runTrackedAiCall"), file).toBe(tracked);
    }
  });
});

describe("реестр ИИ-вызовов вне маршрутов (src/lib)", () => {
  // Вызов модели, вынесенный в библиотеку, тоже должен быть учтён сознательно.
  const LIB_REGISTRY: Record<string, boolean> = {
    "src/lib/coauthor/service.ts": true,
  };
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
    });
  const callers = walk("src/lib")
    .map((f) => f.replace(/\\/g, "/"))
    // слой провайдера сам вызывает модель; бюджет оборачивают его потребители
    .filter((f) => !f.startsWith("src/lib/ai/"))
    .filter((f) => /responses\.(create|stream)\(|chat\.completions\.create\(|\bcomplete\(/.test(readFileSync(f, "utf8")));

  it("все вызовы модели в lib учтены в реестре", () => {
    expect(callers.sort()).toEqual(Object.keys(LIB_REGISTRY).sort());
  });

  it("помеченные как защищённые используют runTrackedAiCall", () => {
    for (const [file, tracked] of Object.entries(LIB_REGISTRY)) {
      expect(readFileSync(file, "utf8").includes("runTrackedAiCall"), file).toBe(tracked);
    }
  });
});
