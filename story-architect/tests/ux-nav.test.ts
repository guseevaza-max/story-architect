import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/usageReport", () => ({
  parseMonth: () => "2026-11",
  loadUsageOverview: async () => ({ budgetUsedUsd: 12.5, limitUsd: 50, warnPercent: 80 }),
}));

import {
  activeGroup,
  activeItemKey,
  allNavHrefs,
  chapterStatusCounts,
  countWords,
  isNavHidden,
  navGroups,
  navTools,
  nextTask,
  proposalKindLabel,
  type ChapterBrief,
} from "../src/lib/ux/nav";
import { loadProjectSummary } from "../src/lib/ux/summary";

const P = "p1";
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** Все разделы, которые были на главной странице проекта до p36. */
const LEGACY = ["lore", "canon", "plot-map", "export", "story-bible", "proposals", "characters", "world", "chapters", "memory", "relationships", "plot-lines", "timeline", "references"];

function pageFile(href: string): string {
  if (href === "/ai-usage") return "src/app/ai-usage/page.tsx";
  const rest = href.replace(`/projects/${P}`, "");
  return `src/app/projects/[id]${rest}/page.tsx`;
}

describe("навигация: полнота и доступность разделов", () => {
  it("содержит пять направлений в согласованном порядке", () => {
    expect(navGroups(P).map((g) => g.label)).toEqual(["Рабочий стол", "Книги и главы", "Вселенная", "Сюжет", "Центр решений"]);
  });

  it("все прежние разделы остались в навигации", () => {
    const hrefs = allNavHrefs(P);
    for (const s of LEGACY) expect(hrefs, s).toContain(`/projects/${P}/${s}`);
    expect(hrefs).toContain("/ai-usage");
    expect(hrefs).toContain(`/projects/${P}`);
  });

  it("каждая ссылка навигации ведёт на существующую страницу", () => {
    for (const href of allNavHrefs(P)) expect(existsSync(join(process.cwd(), pageFile(href))), href).toBe(true);
  });

  it("адреса не повторяются и ключи уникальны", () => {
    const hrefs = allNavHrefs(P);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    const keys = navGroups(P).flatMap((g) => g.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Референсы находятся во Вселенной, рядом с материалами", () => {
    const universe = navGroups(P).find((g) => g.key === "universe")!;
    const keys = universe.items.map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["story-bible", "lore", "references", "characters", "world", "relationships", "canon", "memory"]));
  });

  it("инструменты: экспорт и расходы ИИ", () => {
    expect(navTools(P).map((t) => t.key)).toEqual(["export", "ai-usage"]);
  });
});

describe("активное направление", () => {
  const g = (path: string) => activeGroup(path, P);
  it("определяет направление по адресу", () => {
    expect(g(`/projects/${P}`)).toBe("dashboard");
    expect(g(`/projects/${P}/`)).toBe("dashboard");
    expect(g(`/projects/${P}/chapters`)).toBe("books");
    expect(g(`/projects/${P}/chapters/c9`)).toBe("books");
    expect(g(`/projects/${P}/story-bible`)).toBe("universe");
    expect(g(`/projects/${P}/lore`)).toBe("universe");
    expect(g(`/projects/${P}/references`)).toBe("universe");
    expect(g(`/projects/${P}/canon`)).toBe("universe");
    expect(g(`/projects/${P}/plot-map`)).toBe("plot");
    expect(g(`/projects/${P}/timeline`)).toBe("plot");
    expect(g(`/projects/${P}/proposals`)).toBe("decisions");
  });
  it("вне навигации: экспорт, чужой проект, неизвестный раздел", () => {
    expect(g(`/projects/${P}/export`)).toBeNull();
    expect(g(`/projects/other/chapters`)).toBeNull();
    expect(g(`/projects/${P}/unknown`)).toBeNull();
    expect(g("/dashboard")).toBeNull();
  });
  it("подсвечивает подпункт", () => {
    expect(activeItemKey(`/projects/${P}/relationships`, P)).toBe("relationships");
    expect(activeItemKey(`/projects/${P}/chapters/c1`, P)).toBe("chapters");
    expect(activeItemKey(`/projects/${P}`, P)).toBe("dashboard");
    expect(activeItemKey(`/projects/${P}/zzz`, P)).toBeNull();
  });
  it("навигация скрывается на экспорте (печать)", () => {
    expect(isNavHidden(`/projects/${P}/export`)).toBe(true);
    expect(isNavHidden(`/projects/${P}/chapters`)).toBe(false);
  });
});

describe("следующая задача", () => {
  const ch = (n: number, over: Partial<ChapterBrief> = {}): ChapterBrief => ({
    id: `c${n}`, number: n, title: null, status: "IDEA", planApproved: false, sceneCount: 0, hasDraft: false, hasMemory: false, ...over,
  });
  const next = (chapters: ChapterBrief[], pending = 0) => nextTask(P, chapters, pending);

  it("нет глав → создать первую", () => {
    const t = next([]);
    expect(t.title).toMatch(/первую главу/);
    expect(t.href).toBe(`/projects/${P}/chapters`);
  });
  it("глава без плана, есть ожидающие предложения → рассмотреть предложения", () => {
    const t = next([ch(1)], 2);
    expect(t.title).toMatch(/предложения/);
    expect(t.href).toBe(`/projects/${P}/proposals`);
  });
  it("глава без плана и без предложений → спланировать эту главу", () => {
    const t = next([ch(1, { title: "Начало" })]);
    expect(t.title).toContain("Спланировать");
    expect(t.title).toContain("«Начало»");
    expect(t.href).toBe(`/projects/${P}/chapters/c1?tab=intent`);
  });
  it("план утверждён, сцен нет → план сцен", () => {
    expect(next([ch(1, { planApproved: true })]).title).toContain("План сцен");
  });
  it("план и сцены есть, текста нет → написать текст (можно вручную)", () => {
    const t = next([ch(1, { planApproved: true, sceneCount: 3 })]);
    expect(t.title).toContain("Написать текст");
    expect(t.text).toMatch(/вручную/);
  });
  it("есть черновик → проверить и утвердить", () => {
    expect(next([ch(1, { status: "DRAFT", hasDraft: true })]).title).toContain("Проверить");
  });
  it("черновик есть даже без плана: подсказка не требует прохождения этапов", () => {
    expect(next([ch(1, { hasDraft: true })]).title).toContain("Проверить");
  });
  it("утверждена → перевести в Canon", () => {
    expect(next([ch(1, { status: "APPROVED", hasDraft: true })]).title).toContain("Canon");
  });
  it("первая незавершённая глава важнее следующих", () => {
    const t = next([ch(2), ch(1, { status: "CANON", hasMemory: true })]);
    expect(t.chapterId).toBe("c2");
  });
  it("Canon без извлечённой памяти → обновить память", () => {
    expect(next([ch(1, { status: "CANON", hasMemory: false })]).title).toContain("Обновить память");
  });
  it("всё в Canon и память обновлена → следующая глава", () => {
    expect(next([ch(1, { status: "CANON", hasMemory: true })]).title).toContain("следующую главу");
  });
});

describe("вспомогательные функции сводки", () => {
  it("счётчик статусов идёт в порядке работы и пропускает пустые", () => {
    const rows = chapterStatusCounts([{ status: "CANON" }, { status: "IDEA" }, { status: "CANON" }]);
    expect(rows.map((r) => `${r.status}:${r.count}`)).toEqual(["IDEA:1", "CANON:2"]);
  });
  it("слова считаются по пробелам, пустой текст — 0", () => {
    expect(countWords("Анна вошла  в\nкомнату")).toBe(4);
    expect(countWords("   ")).toBe(0);
    expect(countWords(null)).toBe(0);
  });
  it("подписи типов предложений", () => {
    expect(proposalKindLabel("chapter_plan")).toBe("планы глав");
    expect(proposalKindLabel("whatever")).toBe("прочее");
  });
});

describe("сводка рабочего стола: только чтение, без ИИ", () => {
  const calls: string[] = [];
  const fake: any = {
    chapter: {
      findMany: async () => {
        calls.push("chapter.findMany");
        return [
          { id: "c1", number: 1, title: "Начало", status: "DRAFT", planApproved: true, draftText: "раз два три", _count: { scenes: 2 }, chapterSummary: null },
          { id: "c2", number: 2, title: null, status: "IDEA", planApproved: false, draftText: null, _count: { scenes: 0 }, chapterSummary: null },
        ];
      },
    },
    proposal: {
      groupBy: async () => {
        calls.push("proposal.groupBy");
        return [{ entityType: "chapter_plan", _count: { _all: 1 } }, { entityType: "LORE_FACT", _count: { _all: 3 } }];
      },
      findMany: async () => {
        calls.push("proposal.findMany");
        return [];
      },
    },
    coauthorThread: {
      findMany: async () => {
        calls.push("coauthorThread.findMany");
        return [{ id: "t1", title: "Идея финала", mode: "DISCUSSION", updatedAt: new Date() }];
      },
    },
  };

  it("собирает главы, слова, ожидающие решения, расход и беседы", async () => {
    const s = await loadProjectSummary(fake, "u1", P);
    expect(s.chapters).toHaveLength(2);
    expect(s.totalWords).toBe(3);
    expect(s.pending.total).toBe(4);
    expect(s.pending.byKind[0]).toEqual({ label: "факты Lore", count: 3 });
    expect(s.budget).toEqual({ usedUsd: 12.5, limitUsd: 50, warnPercent: 80 });
    expect(s.threads).toHaveLength(1);
    expect(s.next.title).toContain("Проверить");
    expect(calls).toEqual(expect.arrayContaining(["chapter.findMany", "proposal.groupBy", "coauthorThread.findMany"]));
  });

  it("запрос бесед ограничен текущим пользователем и не включает архив", async () => {
    let where: any;
    const spy = { ...fake, coauthorThread: { findMany: async (a: any) => ((where = a.where), []) } };
    await loadProjectSummary(spy, "u1", P);
    expect(where).toMatchObject({ projectId: P, userId: "u1", archivedAt: null });
  });

  it("сбой расходов не ломает сводку", async () => {
    const usage = await import("@/lib/ai/usageReport");
    vi.spyOn(usage, "loadUsageOverview").mockRejectedValueOnce(new Error("нет данных"));
    const s = await loadProjectSummary(fake, "u1", P);
    expect(s.budget).toBeNull();
    expect(s.chapters).toHaveLength(2);
  });

  it("исходник сводки не обращается к ИИ и не пишет в базу", () => {
    for (const file of ["src/lib/ux/summary.ts", "src/lib/ux/nav.ts", "src/app/projects/[id]/_components/ProjectSummaryView.tsx"]) {
      const text = read(file);
      expect(text, file).not.toMatch(/ai\/provider|getOpenAIClient|runTrackedAiCall|chat\.completions|complete\(/);
      expect(text, file).not.toMatch(/\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\(/);
    }
  });
});

describe("подключение навигации и исправления ссылок", () => {
  it("layout проекта показывает навигацию и сохраняет панель Соавтора", () => {
    const layout = read("src/app/projects/[id]/layout.tsx");
    expect(layout).toContain("ProjectNav");
    expect(layout).toContain("CoauthorDock");
    expect(layout).toMatch(/userId: session\.user\.id/); // навигация только владельцу
  });

  it("главная проекта сохранила все прежние ссылки на разделы", () => {
    const page = read("src/app/projects/[id]/page.tsx");
    for (const s of LEGACY) expect(page, s).toContain(`/projects/\${project.id}/${s}`);
    expect(page).toContain("/ai-usage");
    expect(page).toContain("ProjectSummaryView");
  });

  it("ссылка «создать проект» ведёт на создание, а не на «/»", () => {
    const dash = read("src/app/dashboard/page.tsx");
    expect(dash).toMatch(/href="\/projects\/new"\s*>\s*← Создать новый проект/);
  });

  it("со страницы расходов ИИ есть возврат к проектам", () => {
    expect(read("src/app/ai-usage/page.tsx")).toContain('<Link href="/dashboard">← К проектам</Link>');
  });

  it("после Architect и Scene Planner есть ссылка на предложения", () => {
    const dir = "src/app/projects/[id]/chapters/[chapterId]/";
    expect(read(dir + "ArchitectButton.tsx")).toContain("/proposals");
    expect(read(dir + "ScenePlannerButton.tsx")).toContain("/proposals");
  });

  it("новые файлы не трогают схему, провайдера ИИ и бюджет", () => {
    for (const file of ["src/lib/ux/nav.ts", "src/lib/ux/summary.ts", "src/app/projects/[id]/_components/ProjectNav.tsx", "src/app/projects/[id]/layout.tsx"]) {
      expect(read(file), file).not.toMatch(/AI_API_KEY|aiBudget\.(upsert|update)|aiModelPrice/);
    }
  });
});
