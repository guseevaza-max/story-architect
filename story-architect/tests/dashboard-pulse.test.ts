import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chapterTab, visibleChapters, type ChapterBrief } from "../src/lib/ux/nav";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const brief = (o: Partial<ChapterBrief> = {}): ChapterBrief => ({ id: "c", number: 1, title: null, status: "IDEA", planApproved: false, sceneCount: 0, hasDraft: false, hasMemory: false, ...o });

describe("пульт: вкладка для главы в ряду", () => {
  it("совпадает с правилом страницы главы", () => {
    expect(chapterTab(brief())).toBe("intent");
    expect(chapterTab(brief({ hasIdea: true }))).toBe("planning");
    expect(chapterTab(brief({ planApproved: true, sceneCount: 2 }))).toBe("draft");
    expect(chapterTab(brief({ hasDraft: true, status: "DRAFT" }))).toBe("analysis");
    expect(chapterTab(brief({ hasDraft: true, status: "CHECKING" }))).toBe("finish");
    expect(chapterTab(brief({ status: "CANON", hasDraft: true }))).toBe("finish");
    expect(chapterTab(brief({ pendingPlan: 1, planApproved: true }))).toBe("planning");
  });
});

describe("пульт: какие главы показать", () => {
  const many = (n: number, canonUpTo: number) => Array.from({ length: n }, (_, i) => ({ number: i + 1, status: i < canonUpTo ? "CANON" : "IDEA" }));
  it("короткий список показывается целиком", () => {
    expect(visibleChapters(many(5, 2)).map((c) => c.number)).toEqual([1, 2, 3, 4, 5]);
  });
  it("длинный: окно вокруг первой незавершённой, с одной предыдущей", () => {
    const v = visibleChapters(many(40, 20), 12);
    expect(v).toHaveLength(12);
    expect(v[0]!.number).toBe(20);
    expect(v.some((c) => c.number === 21)).toBe(true);
  });
  it("если всё в Canon — последние главы", () => {
    const v = visibleChapters(many(30, 30), 12);
    expect(v[v.length - 1]!.number).toBe(30);
    expect(v).toHaveLength(12);
  });
  it("пустой список", () => {
    expect(visibleChapters([])).toEqual([]);
  });
});

describe("пульт и пустые состояния: разметка", () => {
  const view = read("src/app/projects/[id]/_components/ProjectSummaryView.tsx");
  it("пульт: блок продолжения, ждущие решения, расход, ряд глав со ссылкой на вкладку", () => {
    expect(view).toContain("Продолжить работу");
    expect(view).toContain("Ждут вашего решения");
    expect(view).toContain("Расход ИИ за месяц");
    expect(view).toContain("chapterTab(c)");
    expect(view).toContain("sa-chapters");
    expect(view).not.toMatch(/fetch\(|runTrackedAiCall|\.(create|update|delete)\(/);
  });
  it("сетка стилей пульта и учёт узких экранов", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(".sa-pulse");
    expect(css).toMatch(/max-width: 800px\)[^}]*sa-pulse/);
    expect(css).toContain("prefers-reduced-motion");
  });
  it("пустые состояния получили кнопки действий; вкладка меняется по ссылке на той же странице", () => {
    const views = read("src/app/projects/[id]/chapters/[chapterId]/PlanViews.tsx");
    expect(views).toContain("action?:");
    const page = read("src/app/projects/[id]/chapters/[chapterId]/page.tsx");
    expect(page).toContain('stageHref(base, "planning")');
    expect(page).toContain('stageHref(base, "draft")');
    expect(page).toContain("Открыть Центр решений →");
    const ws = read("src/app/projects/[id]/chapters/[chapterId]/ChapterWorkspace.tsx");
    expect(ws).toMatch(/useEffect\(\(\) => \{\s*setStage\(initialStage\);\s*\}, \[initialStage\]\)/);
  });
});
