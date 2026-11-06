import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
// @ts-ignore
import { renderToStaticMarkup } from "react-dom/server";
import { planReportStatus, summaryText } from "@/lib/ux/planHistory";
import PlanCheckHistory from "../src/app/projects/[id]/chapters/[chapterId]/PlanCheckHistory";

(globalThis as any).React = React;
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("история проверок плана", () => {
  it("статус выводится из замечаний", () => {
    expect(planReportStatus([])).toBe("PASS");
    expect(planReportStatus([{ priority: "USEFUL" }])).toBe("WARN");
    expect(planReportStatus([{ priority: "IMPORTANT" }, { priority: "CRITICAL" }])).toBe("FAIL");
  });
  it("summaryText терпит не-строку", () => {
    expect(summaryText("ок")).toBe("ок");
    expect(summaryText(null)).toBe("");
    expect(summaryText({ a: 1 })).toBe("");
  });
  it("пустая история ничего не рисует", () => {
    expect(renderToStaticMarkup(React.createElement(PlanCheckHistory, { items: [] }))).toBe("");
  });
  it("рисует отчёты без кнопок", () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanCheckHistory, {
        items: [{ id: "r1", createdAt: "2026-11-01T10:00:00Z", summary: "Итог", issues: [{ title: "Тайна раскрыта рано", priority: "CRITICAL", category: "SPOILER" }] }],
      })
    );
    expect(html).toContain("История проверок плана (1)");
    expect(html).toContain("Тайна раскрыта рано");
    expect(html).toContain("Есть проблемы");
    expect(html).not.toContain("<button");
  });
  it("загрузчик читает только level 0 и не падает при сбое; страница ничего не запускает", () => {
    const loader = read("src/lib/chapters/loadChapterPage.ts");
    expect(loader).toContain("level: 0");
    expect(loader).toMatch(/catch \{\s*planChecks = \[\]/);
    expect(read("src/app/projects/[id]/chapters/[chapterId]/PlanCheckHistory.tsx")).not.toMatch(/fetch\(|"use client"/);
  });
});
