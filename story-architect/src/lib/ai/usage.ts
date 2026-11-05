/**
 * AI Usage: чистая логика учёта расходов (без базы и без сети).
 *
 *  - normalizeUsage: приводит `usage` из ответа провайдера к единому виду;
 *  - computeCost: считает стоимость; если её нельзя определить достоверно,
 *    возвращает UNKNOWN, а не ноль;
 *  - pickPrice: выбирает действующий тариф;
 *  - monthKey, estimateReserveUsd, aggregateUsage.
 */

export const DEFAULT_MONTHLY_LIMIT_USD = 50;
export const DEFAULT_WARN_PERCENT = 80;
/** Резерв, если тариф модели неизвестен: консервативная сумма за один вызов. */
export const FALLBACK_RESERVE_USD = 0.1;

export type UsageNumbers = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

export type ModelPrice = {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M: number | null;
  effectiveFrom: Date;
};

export type CostResult =
  | { status: "KNOWN"; costUsd: number }
  | { status: "UNKNOWN"; reason: "NO_USAGE" | "NO_PRICE" };

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : null;

/**
 * Понимает оба формата: Chat Completions (prompt_tokens / completion_tokens)
 * и Responses API (input_tokens / output_tokens). Если нет входных или
 * выходных токенов, возвращает null: стоимость по неполным данным не считаем.
 */
export function normalizeUsage(raw: unknown): UsageNumbers | null {
  const u = obj(raw);
  if (!u) return null;

  const input = isCount(u.prompt_tokens) ? u.prompt_tokens : isCount(u.input_tokens) ? u.input_tokens : null;
  const output = isCount(u.completion_tokens) ? u.completion_tokens : isCount(u.output_tokens) ? u.output_tokens : null;
  if (input === null || output === null) return null;

  const cachedRaw =
    obj(u.prompt_tokens_details)?.cached_tokens ?? obj(u.input_tokens_details)?.cached_tokens ?? 0;
  const cached = isCount(cachedRaw) ? Math.min(cachedRaw, input) : 0;

  return { inputTokens: input, outputTokens: output, cachedTokens: cached };
}

const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/**
 * Стоимость вызова в USD. Токены рассуждения входят в выходные токены
 * провайдера и оплачиваются по цене вывода. Если тариф кэша не задан,
 * кэшированные токены считаются по цене обычного входа (верхняя граница).
 */
export function computeCost(usage: UsageNumbers | null, price: ModelPrice | null): CostResult {
  if (!usage) return { status: "UNKNOWN", reason: "NO_USAGE" };
  if (!price) return { status: "UNKNOWN", reason: "NO_PRICE" };

  const cachedPrice = price.cachedInputPer1M ?? price.inputPer1M;
  const fresh = usage.inputTokens - usage.cachedTokens;
  const costUsd =
    (fresh / 1e6) * price.inputPer1M +
    (usage.cachedTokens / 1e6) * cachedPrice +
    (usage.outputTokens / 1e6) * price.outputPer1M;

  return { status: "KNOWN", costUsd: round6(costUsd) };
}

/** Действующий на момент `at` тариф: самый поздний с effectiveFrom ≤ at. */
export function pickPrice<T extends { effectiveFrom: Date }>(prices: T[], at: Date): T | null {
  const valid = prices.filter((p) => p.effectiveFrom.getTime() <= at.getTime());
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => (b.effectiveFrom.getTime() > a.effectiveFrom.getTime() ? b : a));
}

/** Месяц учёта в формате YYYY-MM по UTC. */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Типичные размеры запросов для резерва (верхняя граница, а не среднее). */
export const ROLE_ESTIMATES: Record<string, { inputTokens: number; outputTokens: number }> = {
  SCENE_PLANNER: { inputTokens: 16_000, outputTokens: 10_000 },
  WRITER: { inputTokens: 30_000, outputTokens: 20_000 },
  REVISE: { inputTokens: 30_000, outputTokens: 20_000 },
  STORY_ARCHITECT: { inputTokens: 30_000, outputTokens: 12_000 },
  MEMORY_EXTRACTION: { inputTokens: 30_000, outputTokens: 10_000 },
  LORE_EXTRACTION: { inputTokens: 20_000, outputTokens: 14_000 },
};
export const DEFAULT_ESTIMATE = { inputTokens: 25_000, outputTokens: 16_000 };

export function estimateReserveUsd(
  price: ModelPrice | null,
  estimate: { inputTokens: number; outputTokens: number }
): number {
  if (!price) return FALLBACK_RESERVE_USD;
  const cost =
    (estimate.inputTokens / 1e6) * price.inputPer1M + (estimate.outputTokens / 1e6) * price.outputPer1M;
  return Math.max(round6(cost), 0.000001);
}

export class BudgetExceededError extends Error {
  constructor(
    readonly limitUsd: number,
    readonly period: string
  ) {
    super(`Месячный лимит расходов на ИИ (${limitUsd} USD, ${period}) исчерпан.`);
    this.name = "BudgetExceededError";
  }
}

// ───────────────────────── отчёт ─────────────────────────

export type UsageRow = {
  createdAt: Date;
  projectId: string;
  roleKey: string;
  model: string;
  provider: string | null;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  estimatedCost: number | null;
};

export type UsageGroup = {
  key: string;
  calls: number;
  failedCalls: number;
  /** Сумма известных стоимостей. */
  knownCostUsd: number;
  /** Вызовы, стоимость которых неизвестна (не учтены в сумме). */
  unknownCostCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

export type UsageReport = {
  total: UsageGroup;
  byRole: UsageGroup[];
  byModel: UsageGroup[];
  byDay: UsageGroup[];
  byProject: UsageGroup[];
};

const emptyGroup = (key: string): UsageGroup => ({
  key,
  calls: 0,
  failedCalls: 0,
  knownCostUsd: 0,
  unknownCostCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
});

function add(group: UsageGroup, row: UsageRow) {
  group.calls += 1;
  if (row.status === "FAILED") group.failedCalls += 1;
  if (row.estimatedCost === null) {
    // Неудавшийся вызов без токенов ничего не стоил; остальные: стоимость неизвестна.
    if (row.status !== "FAILED") group.unknownCostCalls += 1;
  } else {
    group.knownCostUsd = round6(group.knownCostUsd + row.estimatedCost);
  }
  group.inputTokens += row.inputTokens ?? 0;
  group.outputTokens += row.outputTokens ?? 0;
  group.cachedTokens += row.cachedTokens ?? 0;
}

export function aggregateUsage(rows: UsageRow[]): UsageReport {
  const total = emptyGroup("total");
  const maps = {
    role: new Map<string, UsageGroup>(),
    model: new Map<string, UsageGroup>(),
    day: new Map<string, UsageGroup>(),
    project: new Map<string, UsageGroup>(),
  };
  const bucket = (map: Map<string, UsageGroup>, key: string) => {
    let g = map.get(key);
    if (!g) {
      g = emptyGroup(key);
      map.set(key, g);
    }
    return g;
  };

  for (const row of rows) {
    add(total, row);
    add(bucket(maps.role, row.roleKey), row);
    // У записей до AI Usage провайдер не сохранялся; домысливать его нельзя.
    add(bucket(maps.model, `${row.provider ?? "провайдер не указан"} / ${row.model}`), row);
    add(bucket(maps.day, row.createdAt.toISOString().slice(0, 10)), row);
    add(bucket(maps.project, row.projectId), row);
  }

  const byCost = (a: UsageGroup, b: UsageGroup) => b.knownCostUsd - a.knownCostUsd || b.calls - a.calls;
  return {
    total,
    byRole: [...maps.role.values()].sort(byCost),
    byModel: [...maps.model.values()].sort(byCost),
    byDay: [...maps.day.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byProject: [...maps.project.values()].sort(byCost),
  };
}
