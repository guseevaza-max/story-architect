import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_MONTHLY_LIMIT_USD,
  DEFAULT_WARN_PERCENT,
  aggregateUsage,
  monthKey,
  type UsageReport,
} from "./usage";

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseMonth(value: string | null | undefined, now = new Date()): string {
  return value && MONTH_PATTERN.test(value) ? value : monthKey(now);
}

/** Границы месяца по UTC: [start, end). */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export type UsageOverview = {
  month: string;
  limitUsd: number;
  warnPercent: number;
  /** Известные расходы + консервативный учёт вызовов с неизвестной стоимостью + резерв. */
  budgetUsedUsd: number;
  counter: { spentUsd: number; assumedUsd: number; reservedUsd: number; unknownCostCalls: number; callCount: number };
  report: UsageReport;
  projectNames: Record<string, string>;
  prices: {
    id: string;
    provider: string;
    model: string;
    inputPer1M: number;
    outputPer1M: number;
    cachedInputPer1M: number | null;
    source: string | null;
    effectiveFrom: string;
  }[];
};

export async function loadUsageOverview(prisma: PrismaClient, userId: string, month: string): Promise<UsageOverview> {
  const { start, end } = monthRange(month);

  const [budget, counterRow, runs, prices] = await Promise.all([
    prisma.aiBudget.findUnique({ where: { userId } }),
    prisma.aiBudgetMonth.findUnique({ where: { userId_month: { userId, month } } }),
    prisma.aiRun.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      select: {
        createdAt: true,
        projectId: true,
        roleKey: true,
        model: true,
        provider: true,
        status: true,
        inputTokens: true,
        outputTokens: true,
        cachedTokens: true,
        estimatedCost: true,
      },
      orderBy: { createdAt: "asc" },
      take: 20000,
    }),
    prisma.aiModelPrice.findMany({ orderBy: [{ provider: "asc" }, { model: "asc" }, { effectiveFrom: "desc" }] }),
  ]);

  const report = aggregateUsage(
    runs.map((r) => ({ ...r, estimatedCost: r.estimatedCost === null ? null : Number(r.estimatedCost) }))
  );

  const projects = await prisma.project.findMany({
    where: { id: { in: report.byProject.map((g) => g.key) } },
    select: { id: true, name: true },
  });

  const counter = {
    spentUsd: Number(counterRow?.spentUsd ?? 0),
    assumedUsd: Number(counterRow?.assumedUsd ?? 0),
    reservedUsd: Number(counterRow?.reservedUsd ?? 0),
    unknownCostCalls: counterRow?.unknownCostCalls ?? 0,
    callCount: counterRow?.callCount ?? 0,
  };

  return {
    month,
    limitUsd: budget ? Number(budget.monthlyLimitUsd) : DEFAULT_MONTHLY_LIMIT_USD,
    warnPercent: budget?.warnPercent ?? DEFAULT_WARN_PERCENT,
    budgetUsedUsd: counter.spentUsd + counter.assumedUsd + counter.reservedUsd,
    counter,
    report,
    projectNames: Object.fromEntries(projects.map((p) => [p.id, p.name])),
    prices: prices.map((p) => ({
      id: p.id,
      provider: p.provider,
      model: p.model,
      inputPer1M: Number(p.inputPer1M),
      outputPer1M: Number(p.outputPer1M),
      cachedInputPer1M: p.cachedInputPer1M === null ? null : Number(p.cachedInputPer1M),
      source: p.source,
      effectiveFrom: p.effectiveFrom.toISOString(),
    })),
  };
}
