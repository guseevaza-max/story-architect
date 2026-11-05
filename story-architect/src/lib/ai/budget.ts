/**
 * Бюджет и учёт ИИ-вызовов.
 *
 * runTrackedAiCall оборачивает один вызов провайдера:
 *   1. резервирует оценочную сумму в месячном счётчике АТОМАРНОЙ командой
 *      (лимит проверяется внутри самого UPDATE, поэтому параллельные запросы
 *      не могут вместе превысить лимит);
 *   2. выполняет вызов;
 *   3. берёт реальные `usage`, считает стоимость (или помечает как неизвестную);
 *   4. снимает резерв и записывает фактический расход и строку AiRun.
 *
 * Ошибки самой инфраструктуры учёта (например, миграция не применена) по
 * умолчанию не ломают генерацию: вызов выполняется без учёта и это пишется в
 * лог. AI_BUDGET_FAIL_CLOSED=true включает строгий режим. Превышение лимита
 * всегда блокирует вызов.
 */
import type { PrismaClient } from "@prisma/client";
import {
  BudgetExceededError,
  DEFAULT_ESTIMATE,
  DEFAULT_MONTHLY_LIMIT_USD,
  ROLE_ESTIMATES,
  computeCost,
  estimateReserveUsd,
  monthKey,
  normalizeUsage,
  type ModelPrice,
} from "./usage";

export { BudgetExceededError } from "./usage";

// ───────────────────────── хранилище счётчика ─────────────────────────

export interface BudgetStore {
  /** Атомарно резервирует сумму, если она укладывается в лимит месяца. */
  reserve(args: { userId: string; period: string; amountUsd: number; defaultLimitUsd: number }): Promise<{ ok: boolean }>;
  /** Снимает резерв и добавляет фактический расход. */
  settle(args: {
    userId: string;
    period: string;
    reservedUsd: number;
    spentUsd: number;
    assumedUsd: number;
    unknownCost: boolean;
    countCall: boolean;
  }): Promise<void>;
}

export const SQL_ENSURE_MONTH = `INSERT INTO "AiBudgetMonth" ("id", "userId", "month", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, NOW())
ON CONFLICT ("userId", "month") DO NOTHING`;

/** Лимит проверяется в WHERE самого UPDATE: чек и увеличение резерва неделимы. */
export const SQL_RESERVE = `UPDATE "AiBudgetMonth" m
SET "reservedUsd" = m."reservedUsd" + $3::numeric, "updatedAt" = NOW()
WHERE m."userId" = $1 AND m."month" = $2
  AND m."spentUsd" + m."assumedUsd" + m."reservedUsd" + $3::numeric
      <= COALESCE((SELECT b."monthlyLimitUsd" FROM "AiBudget" b WHERE b."userId" = $1), $4::numeric)
RETURNING m."id"`;

export const SQL_SETTLE = `UPDATE "AiBudgetMonth"
SET "reservedUsd" = GREATEST("reservedUsd" - $3::numeric, 0),
    "spentUsd" = "spentUsd" + $4::numeric,
    "assumedUsd" = "assumedUsd" + $5::numeric,
    "unknownCostCalls" = "unknownCostCalls" + $6::int,
    "callCount" = "callCount" + $7::int,
    "updatedAt" = NOW()
WHERE "userId" = $1 AND "month" = $2`;

const money = (n: number) => n.toFixed(6);

export function createPrismaBudgetStore(prisma: PrismaClient): BudgetStore {
  return {
    async reserve({ userId, period, amountUsd, defaultLimitUsd }) {
      await prisma.$executeRawUnsafe(SQL_ENSURE_MONTH, userId, period);
      const rows = (await prisma.$queryRawUnsafe(
        SQL_RESERVE,
        userId,
        period,
        money(amountUsd),
        money(defaultLimitUsd)
      )) as unknown[];
      return { ok: rows.length > 0 };
    },
    async settle(a) {
      await prisma.$executeRawUnsafe(
        SQL_SETTLE,
        a.userId,
        a.period,
        money(a.reservedUsd),
        money(a.spentUsd),
        money(a.assumedUsd),
        a.unknownCost ? 1 : 0,
        a.countCall ? 1 : 0
      );
    },
  };
}

// ───────────────────────── обёртка вызова ─────────────────────────

export type RunRecord = {
  userId: string;
  projectId: string;
  roleKey: string;
  provider: string;
  model: string;
  status: "SUCCESS" | "FAILED";
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  estimatedCostUsd: number | null;
  costStatus: "KNOWN" | "UNKNOWN";
  costNote: string | null;
  durationMs: number;
  errorMessage: string | null;
};

export type TrackingDeps = {
  store: BudgetStore;
  findPrice(provider: string, model: string, at: Date): Promise<ModelPrice | null>;
  /** Действующий лимит пользователя (для сообщения об ошибке). */
  getLimitUsd(userId: string): Promise<number>;
  recordRun(run: RunRecord): Promise<void>;
  now(): Date;
  failClosed: boolean;
  defaultLimitUsd: number;
  log(message: string, error?: unknown): void;
};

/**
 * Контекст, который получает обёрнутый вызов. Для потоковых запросов:
 * markBillable() вызывается, когда провайдер уже начал отвечать. Если поток
 * после этого оборвётся или будет отменён, токены могли быть оплачены, а их
 * число неизвестно: такой вызов учитывается в лимите по резерву, а не как ноль.
 * Если поток упал до первого события, провайдер ничего не обработал: резерв
 * просто освобождается.
 */
export type CallContext = {
  markBillable(): void;
};

export type TrackedCallOptions = {
  userId: string;
  projectId: string;
  /** Функция-источник запроса, например SCENE_PLANNER. */
  roleKey: string;
  provider: string;
  model: string;
  estimate?: { inputTokens: number; outputTokens: number };
  /**
   * Не создавать строку AiRun: маршрут пишет свою (с payload и связью с
   * Proposal) и берёт стоимость из onResult. Так запись не дублируется.
   */
  skipRecord?: boolean;
  /** Получает итоговые данные учёта (успех и ошибка). Вызывается всегда. */
  onResult?: (run: RunRecord) => void;
};

/** Поля AiRun со стоимостью, чтобы маршрут со своей записью их добавил. */
export function runCostFields(run: RunRecord | null): {
  provider?: string;
  costStatus?: string;
  costNote?: string | null;
  estimatedCost?: number | null;
} {
  if (!run) return {};
  return {
    provider: run.provider,
    costStatus: run.costStatus,
    costNote: run.costNote,
    estimatedCost: run.estimatedCostUsd,
  };
}

export async function runTrackedAiCall<T>(
  deps: TrackingDeps,
  opts: TrackedCallOptions,
  call: (ctx: CallContext) => Promise<{ value: T; usage: unknown }>
): Promise<T> {
  const startedAt = deps.now();
  const period = monthKey(startedAt);
  let price: ModelPrice | null = null;
  let reserveUsd = 0;
  let reserved = false;

  try {
    price = await deps.findPrice(opts.provider, opts.model, startedAt);
    const estimate = opts.estimate ?? ROLE_ESTIMATES[opts.roleKey] ?? DEFAULT_ESTIMATE;
    reserveUsd = estimateReserveUsd(price, estimate);
    const result = await deps.store.reserve({
      userId: opts.userId,
      period,
      amountUsd: reserveUsd,
      defaultLimitUsd: deps.defaultLimitUsd,
    });
    if (!result.ok) {
      let limit = deps.defaultLimitUsd;
      try {
        limit = await deps.getLimitUsd(opts.userId);
      } catch {
        // сообщение об ошибке важнее точности лимита
      }
      throw new BudgetExceededError(limit, period);
    }
    reserved = true;
  } catch (error) {
    if (error instanceof BudgetExceededError) throw error;
    if (deps.failClosed) throw error;
    deps.log("AI Usage: учёт недоступен, вызов выполняется без него", error);
  }

  const settle = async (extra: { spentUsd: number; assumedUsd: number; unknownCost: boolean; countCall: boolean }) => {
    if (!reserved) return;
    try {
      await deps.store.settle({ userId: opts.userId, period, reservedUsd: reserveUsd, ...extra });
    } catch (error) {
      deps.log("AI Usage: не удалось обновить счётчик", error);
    }
  };
  const record = async (run: RunRecord) => {
    try {
      opts.onResult?.(run);
    } catch (error) {
      deps.log("AI Usage: onResult завершился ошибкой", error);
    }
    if (opts.skipRecord) return;
    try {
      await deps.recordRun(run);
    } catch (error) {
      deps.log("AI Usage: не удалось записать AiRun", error);
    }
  };
  const base = {
    userId: opts.userId,
    projectId: opts.projectId,
    roleKey: opts.roleKey,
    provider: opts.provider,
    model: opts.model,
  };

  let billable = false;
  const ctx: CallContext = { markBillable: () => void (billable = true) };

  let outcome: { value: T; usage: unknown };
  try {
    outcome = await call(ctx);
  } catch (error) {
    // Поток начал отвечать и оборвался: токены могли быть оплачены, но их число
    // неизвестно. Считаем по резерву (консервативно), а не как бесплатный вызов.
    await settle({
      spentUsd: 0,
      assumedUsd: billable ? reserveUsd : 0,
      unknownCost: billable,
      countCall: billable,
    });
    await record({
      ...base,
      status: "FAILED",
      inputTokens: null,
      outputTokens: null,
      cachedTokens: null,
      estimatedCostUsd: null,
      costStatus: "UNKNOWN",
      costNote: billable
        ? "Ответ оборвался после начала: токены не получены, в лимит учтён резерв"
        : "Вызов завершился ошибкой, токены не получены",
      durationMs: deps.now().getTime() - startedAt.getTime(),
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Ошибка вызова",
    });
    throw error;
  }

  const usage = normalizeUsage(outcome.usage);
  const cost = computeCost(usage, price);
  const known = cost.status === "KNOWN";

  await settle({
    spentUsd: known ? cost.costUsd : 0,
    // Неизвестная стоимость учитывается по резерву, чтобы лимит не обходился.
    assumedUsd: known ? 0 : reserveUsd,
    unknownCost: !known,
    countCall: true,
  });
  await record({
    ...base,
    status: "SUCCESS",
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    cachedTokens: usage?.cachedTokens ?? null,
    estimatedCostUsd: known ? cost.costUsd : null,
    costStatus: known ? "KNOWN" : "UNKNOWN",
    costNote: known ? null : cost.reason === "NO_USAGE" ? "Провайдер не вернул usage" : "Тариф модели не найден",
    durationMs: deps.now().getTime() - startedAt.getTime(),
    errorMessage: null,
  });

  return outcome.value;
}

// ───────────────────────── боевые зависимости ─────────────────────────

export function createPrismaTrackingDeps(prisma: PrismaClient): TrackingDeps {
  return {
    store: createPrismaBudgetStore(prisma),
    async findPrice(provider, model, at) {
      const rows = await prisma.aiModelPrice.findMany({
        where: { provider, model, effectiveFrom: { lte: at } },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      });
      const row = rows[0];
      if (!row) return null;
      return {
        inputPer1M: Number(row.inputPer1M),
        outputPer1M: Number(row.outputPer1M),
        cachedInputPer1M: row.cachedInputPer1M === null ? null : Number(row.cachedInputPer1M),
        effectiveFrom: row.effectiveFrom,
      };
    },
    getLimitUsd: (userId) => getEffectiveLimitUsd(prisma, userId),
    async recordRun(run) {
      await prisma.aiRun.create({
        data: {
          userId: run.userId,
          projectId: run.projectId,
          roleKey: run.roleKey,
          provider: run.provider,
          model: run.model,
          status: run.status,
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
          cachedTokens: run.cachedTokens,
          estimatedCost: run.estimatedCostUsd,
          costStatus: run.costStatus,
          costNote: run.costNote,
          durationMs: run.durationMs,
          errorMessage: run.errorMessage,
        },
      });
    },
    now: () => new Date(),
    failClosed: process.env.AI_BUDGET_FAIL_CLOSED === "true",
    defaultLimitUsd: DEFAULT_MONTHLY_LIMIT_USD,
    log: (message, error) => console.error(message, error instanceof Error ? error.message : error ?? ""),
  };
}

// ───────────────────────── эффективный лимит ─────────────────────────

export async function getEffectiveLimitUsd(prisma: PrismaClient, userId: string): Promise<number> {
  const row = await prisma.aiBudget.findUnique({ where: { userId } });
  return row ? Number(row.monthlyLimitUsd) : DEFAULT_MONTHLY_LIMIT_USD;
}
