/** Цветовой тон статуса главы: один набор на все экраны. */
export type StatusTone = "neutral" | "info" | "warn" | "violet" | "ok" | "accent";

const TONES: Record<string, StatusTone> = {
  IDEA: "neutral",
  PLANNED: "info",
  DRAFT: "warn",
  EDITING: "warn",
  CHECKING: "violet",
  APPROVED: "ok",
  CANON: "accent",
};

export function statusTone(status: string): StatusTone {
  return TONES[status] ?? "neutral";
}
