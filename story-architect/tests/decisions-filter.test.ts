import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countByView, decisionTitle, entityLabel, entityTypes, filterDecisions, matchesView, statusLabel } from "@/lib/ux/decisions";

const items = [
  { id: "1", entityType: "CHARACTER", status: "PENDING", createdAt: "2026-01-01", payload: { data: { name: "Лиа" } } },
  { id: "2", entityType: "chapter_plan", status: "ACCEPTED", createdAt: "2026-01-02" },
  { id: "3", entityType: "CHARACTER", status: "REJECTED", createdAt: "2026-01-03" },
  { id: "4", entityType: "scene_plan", status: "SUPERSEDED", createdAt: "2026-01-04" },
];

describe("Центр решений: фильтры", () => {
  it("представления по статусам", () => {
    expect(matchesView("PENDING", "pending")).toBe(true);
    expect(matchesView("ACCEPTED", "pending")).toBe(false);
    expect(matchesView("SUPERSEDED", "rejected")).toBe(true);
    expect(matchesView("ACCEPTED", "all")).toBe(true);
  });
  it("счётчики", () => {
    expect(countByView(items)).toEqual({ pending: 1, accepted: 1, rejected: 2, all: 4 });
  });
  it("фильтр по виду и типу", () => {
    expect(filterDecisions(items, "pending", null).map((i) => i.id)).toEqual(["1"]);
    expect(filterDecisions(items, "all", "CHARACTER").map((i) => i.id)).toEqual(["1", "3"]);
    expect(filterDecisions(items, "rejected", "scene_plan").map((i) => i.id)).toEqual(["4"]);
  });
  it("типы, подписи, заголовок", () => {
    expect(entityTypes(items)).toEqual(["CHARACTER", "chapter_plan", "scene_plan"]);
    expect(entityLabel("chapter_plan")).toBe("План главы");
    expect(entityLabel("X")).toBe("X");
    expect(statusLabel("ACCEPTED")).toBe("Принято");
    expect(decisionTitle(items[0]!)).toBe("Лиа");
    expect(decisionTitle(items[1]!)).toBe("План главы");
  });
});

describe("страница предложений: история только для чтения", () => {
  const page = readFileSync(join(process.cwd(), "src/app/projects/[id]/proposals/page.tsx"), "utf8");
  it("карточки с кнопками решений только в разделе «Ждут решения»", () => {
    expect(page).toContain('view === "pending"');
    const hist = page.slice(page.indexOf("<ul"));
    expect(hist).not.toContain("<ProposalCard");
    expect(hist).not.toContain("handleAction");
  });
  it("решение уходит тем же маршрутом", () => {
    expect(page).toContain("/api/proposals/${proposalId}/action");
  });
});
