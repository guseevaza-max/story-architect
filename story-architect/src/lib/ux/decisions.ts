/**
 * Центр решений: чистые функции для фильтров и истории. Ничего не пишут,
 * принятие остаётся в POST /api/proposals/[id]/action.
 */
export type DecisionView = "pending" | "accepted" | "rejected" | "all";

export const DECISION_VIEWS: { key: DecisionView; label: string }[] = [
  { key: "pending", label: "Ждут решения" },
  { key: "accepted", label: "Принятые" },
  { key: "rejected", label: "Отклонённые" },
  { key: "all", label: "Все" },
];

export const ENTITY_LABELS: Record<string, string> = {
  chapter_plan: "План главы",
  scene_plan: "План сцен",
  CHARACTER: "Персонаж",
  LOCATION: "Место",
  LORE_FACT: "Факт мира",
  SECRET: "Тайна",
  EVENT: "Событие",
  FACTION: "Фракция",
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ждёт решения",
  ACCEPTED: "Принято",
  REJECTED: "Отклонено",
  SUPERSEDED: "Заменено новым",
};

export type DecisionItem = {
  id: string;
  entityType: string;
  status: string;
  createdAt: string;
  reason?: string | null;
  payload?: { data?: { name?: string; question?: string; statement?: string } } | null;
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function matchesView(status: string, view: DecisionView): boolean {
  if (view === "all") return true;
  if (view === "pending") return status === "PENDING";
  if (view === "accepted") return status === "ACCEPTED";
  return status === "REJECTED" || status === "SUPERSEDED";
}

export function filterDecisions<T extends { status: string; entityType: string }>(items: T[], view: DecisionView, entityType: string | null): T[] {
  return items.filter((item) => matchesView(item.status, view) && (!entityType || item.entityType === entityType));
}

export function countByView(items: { status: string }[]): Record<DecisionView, number> {
  const counts: Record<DecisionView, number> = { pending: 0, accepted: 0, rejected: 0, all: items.length };
  for (const item of items) {
    if (matchesView(item.status, "pending")) counts.pending++;
    else if (matchesView(item.status, "accepted")) counts.accepted++;
    else if (matchesView(item.status, "rejected")) counts.rejected++;
  }
  return counts;
}

export function entityTypes(items: { entityType: string }[]): string[] {
  return Array.from(new Set(items.map((item) => item.entityType))).sort();
}

export function decisionTitle(item: DecisionItem): string {
  const d = item.payload?.data;
  return d?.name || d?.question || d?.statement || entityLabel(item.entityType);
}
