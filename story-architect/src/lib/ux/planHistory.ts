/** История проверок плана (ContinuityReport level 0). Только чтение, без схемы и без ИИ. */
export type PlanHistoryIssue = { title: string; priority: string; category: string };

export type PlanHistoryItem = {
  id: string;
  createdAt: string;
  summary: string;
  issues: PlanHistoryIssue[];
};

export type PlanHistoryStatus = "PASS" | "WARN" | "FAIL";

/** Статус отчёта в базе не хранится: выводим его из замечаний так же, как их строит severityToRow. */
export function planReportStatus(issues: { priority: string }[]): PlanHistoryStatus {
  if (issues.some((i) => i.priority === "CRITICAL")) return "FAIL";
  return issues.length > 0 ? "WARN" : "PASS";
}

export const PLAN_STATUS_LABEL: Record<PlanHistoryStatus, string> = {
  PASS: "✓ Противоречий нет",
  WARN: "⚠ Есть предупреждения",
  FAIL: "🔴 Есть проблемы",
};

export function summaryText(summary: unknown): string {
  return typeof summary === "string" ? summary : "";
}
