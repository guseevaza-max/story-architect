import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { createElement } from "react";
(globalThis as any).React = React;
// @ts-ignore -- типы react-dom не установлены, нужен только для проверки разметки
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ project: null as any, chapter: null as any, pendingWhere: null as any }));
vi.mock("next/link", () => ({ default: (p: any) => createElement("a", { href: p.href, title: p.title }, p.children) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: async () => h.project },
    chapter: { findFirst: async () => h.chapter, findMany: async () => [] },
    proposal: { findMany: async (a: any) => ((h.pendingWhere = a.where), [{ id: "pr1", entityType: "chapter_plan" }]) },
  },
}));

import ChapterWorkspace from "../src/app/projects/[id]/chapters/[chapterId]/ChapterWorkspace";
import { loadChapterPage, planHasContent } from "../src/lib/chapters/loadChapterPage";
import { STAGES, STAGE_KEYS, nextTabIndex, parseStage, recommend, stageHref, stageStates, type ChapterFacts } from "../src/lib/ux/chapterWorkspace";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const DIR = "src/app/projects/[id]/chapters/[chapterId]/";

const facts = (over: Partial<ChapterFacts> = {}): ChapterFacts => ({
  status: "IDEA", hasIdea: false, hasIntent: false, planApproved: false, sceneCount: 0, hasDraft: false, pendingPlanProposals: 0, ...over,
});

describe("этапы и рекомендации", () => {
  it("пять этапов в согласованном порядке", () => {
    expect(STAGES.map((s) => s.label)).toEqual(["Замысел", "Планирование", "Черновик", "Анализ", "Завершение"]);
    expect(STAGE_KEYS).toEqual(["intent", "planning", "draft", "analysis", "finish"]);
  });

  it("parseStage принимает только известные значения", () => {
    expect(parseStage("draft")).toBe("draft");
    expect(parseStage(["analysis", "x"])).toBe("analysis");
    expect(parseStage("hack")).toBeNull();
    expect(parseStage(undefined)).toBeNull();
    expect(parseStage("")).toBeNull();
  });

  it("рекомендация по состоянию главы", () => {
    expect(recommend(facts()).stage).toBe("intent");
    expect(recommend(facts({ hasIdea: true })).stage).toBe("planning");
    expect(recommend(facts({ pendingPlanProposals: 1 })).stage).toBe("planning");
    expect(recommend(facts({ planApproved: true })).stage).toBe("planning");
    expect(recommend(facts({ planApproved: true, sceneCount: 3 })).stage).toBe("draft");
    expect(recommend(facts({ hasDraft: true })).stage).toBe("analysis");
    expect(recommend(facts({ status: "APPROVED", hasDraft: true })).stage).toBe("finish");
    expect(recommend(facts({ status: "CANON", hasDraft: true })).stage).toBe("finish");
  });

  it("рекомендация не требует пройденных этапов: черновик без плана — сразу анализ", () => {
    expect(recommend(facts({ hasDraft: true, planApproved: false })).stage).toBe("analysis");
  });

  it("отметки этапов считаются по данным", () => {
    const s = stageStates(facts({ hasIdea: true, planApproved: true, sceneCount: 2, hasDraft: true, status: "CANON" }));
    expect(s).toMatchObject({ intent: "done", planning: "done", draft: "done", finish: "done" });
    expect(stageStates(facts()).intent).toBe("optional");
  });

  it("клавиши навигации по вкладкам", () => {
    expect(nextTabIndex("ArrowRight", 4, 5)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 5)).toBe(4);
    expect(nextTabIndex("Home", 3, 5)).toBe(0);
    expect(nextTabIndex("End", 0, 5)).toBe(4);
    expect(nextTabIndex("a", 1, 5)).toBeNull();
    expect(nextTabIndex("Enter", 1, 5)).toBeNull();
  });

  it("адрес этапа", () => {
    expect(stageHref("/projects/p/chapters/c", "draft")).toBe("/projects/p/chapters/c?tab=draft");
  });
});

describe("оболочка вкладок (отрисовка)", () => {
  const panels = Object.fromEntries(STAGE_KEYS.map((k) => [k, createElement("div", { "data-panel": k }, `содержимое ${k}`)])) as any;
  const states = stageStates(facts({ hasIdea: true }));
  const render = (stage: any = "planning") =>
    renderToStaticMarkup(
      createElement(ChapterWorkspace, {
        initialStage: stage,
        basePath: "/projects/p/chapters/c",
        legacyHref: "/projects/p/chapters/c/legacy",
        backHref: "/projects/p/chapters",
        title: "Начало",
        bookChapter: "Книга 1 · Глава 1",
        status: "IDEA",
        statusLabel: "Идея",
        states,
        recommendation: { stage: "planning", text: "Запустите Architect" },
        panels,
      })
    );

  it("показывает пять вкладок, одна выбрана", () => {
    const html = render("draft");
    expect((html.match(/role="tab"/g) ?? []).length).toBe(5);
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/id="tab-draft"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="tab-draft"/);
    expect(html).toContain('role="tablist"');
  });

  it("клавиатура: в порядке табуляции только активная вкладка", () => {
    const html = render("analysis");
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1);
    expect((html.match(/tabindex="-1"/g) ?? []).length).toBe(4);
  });

  it("все панели в разметке, неактивные скрыты, а не удалены (текст редактора не теряется)", () => {
    const html = render("planning");
    for (const k of STAGE_KEYS) expect(html, k).toContain(`data-panel="${k}"`);
    expect((html.match(/role="tabpanel"/g) ?? []).length).toBe(5);
    expect((html.match(/ hidden=""/g) ?? []).length).toBe(4);
  });

  it("статус, рекомендация, возврат и ссылка на старый вид видны всегда", () => {
    const html = render("intent");
    expect(html).toContain("Статус: Идея");
    expect(html).toContain("Рекомендуем:");
    expect(html).toContain("Это подсказка: открывать этапы можно в любом порядке");
    expect(html).toContain('href="/projects/p/chapters/c/legacy"');
    expect(html).toContain('href="/projects/p/chapters"');
  });

  it("связь вкладок и панелей по aria", () => {
    const html = render();
    for (const k of STAGE_KEYS) {
      expect(html).toContain(`aria-controls="panel-${k}"`);
      expect(html).toContain(`aria-labelledby="tab-${k}"`);
    }
  });
});

describe("загрузка данных главы и доступ", () => {
  it("чужой проект или чужая глава → null (страница отдаёт 404)", async () => {
    h.project = null;
    h.chapter = null;
    expect(await loadChapterPage("u1", "p1", "c1")).toBeNull();
    h.project = { id: "p1", name: "П" };
    expect(await loadChapterPage("u1", "p1", "c1")).toBeNull();
  });

  it("ожидающие предложения только этой главы, только планы, только в ожидании", async () => {
    h.project = { id: "p1", name: "П" };
    h.chapter = { id: "c1", plan: null, scenes: [], book: { number: 1 } };
    const data = await loadChapterPage("u1", "p1", "c1");
    expect(data!.pending).toHaveLength(1);
    expect(h.pendingWhere).toMatchObject({ projectId: "p1", status: "PENDING", sourceChapterId: "c1" });
    expect(h.pendingWhere.entityType.in).toEqual(["chapter_plan", "scene_plan"]);
  });

  it("planHasContent", () => {
    expect(planHasContent(null)).toBe(false);
    expect(planHasContent({})).toBe(false);
    expect(planHasContent({ chapterPurpose: "цель" })).toBe(true);
  });
});

describe("состав страниц: ничего не потеряно", () => {
  const COMPONENTS = ["ArchitectButton", "SaveIdeaForm", "AuthorIntentPanel", "ScenePlannerButton", "writerButton", "NarrativeContextPanel", "ContinuityButton", "ContinuitySuggestionsButton", "DraftEditor", "ApproveChapterButton", "CanonChapterButton", "MemoryUpdateButton"];
  const TAGS = ["ArchitectButton", "SaveIdeaForm", "AuthorIntentPanel", "ScenePlannerButton", "WriterButton", "NarrativeContextPanel", "ContinuityButton", "ContinuitySuggestionsButton", "DraftEditor", "ApproveChapterButton", "CanonChapterButton", "MemoryUpdateButton"];

  it("новая страница использует все прежние компоненты", () => {
    const page = read(DIR + "page.tsx");
    for (const c of COMPONENTS) expect(page, c).toContain(`"./${c}"`);
    for (const t of TAGS) expect(page, t).toContain(`<${t} `);
  });

  it("резервная страница остаётся с полным прежним составом и ведёт на новый вид", () => {
    const legacy = read(DIR + "legacy/page.tsx");
    for (const c of COMPONENTS) expect(legacy, c).toContain(`"../${c}"`);
    for (const t of TAGS) expect(legacy, t).toContain(`<${t} `);
    expect(legacy).toContain("Вернуться к новому виду с вкладками");
    expect(legacy).toContain("redirect(\"/login\")");
    expect(legacy).toContain("notFound()");
  });

  it("новая страница проверяет вход и принадлежность проекта", () => {
    const page = read(DIR + "page.tsx");
    expect(page).toContain('redirect("/login")');
    expect(page).toContain("if (!data) notFound()");
    expect(page).toContain("session.user.id");
  });

  it("проверка до написания: есть настоящая проверка плана; проверка текста только на вкладке «Анализ» при наличии черновика", () => {
    const page = read(DIR + "page.tsx");
    expect((page.match(/<ContinuityButton /g) ?? []).length).toBe(2);
    const analysis = page.slice(page.indexOf("analysis: hasDraft"), page.indexOf("// ───────────── 5."));
    expect(analysis).toContain("<ContinuityButton ");
    expect(analysis).not.toContain('mode="plan"');
    const planning = page.slice(page.indexOf("planning: ("), page.indexOf("// ───────────── 3."));
    expect(planning).toContain('<ContinuityButton projectId={project.id} chapterId={chapter.id} mode="plan" />');
    expect(planning).toContain("Проверка плана и сцен до написания");
    expect(planning).toContain("hasPlan || hasScenes");
  });

  it("утверждение планов остаётся в Центре решений: встроенного принятия нет", () => {
    const page = read(DIR + "page.tsx");
    expect(page).toContain("/proposals");
    expect(page).not.toMatch(/proposals\/\$\{[^}]*\}\/action|api\/proposals/);
    expect(page).toContain("Автоматически ничего не принимается");
  });

  it("Writer только при сценах, Approve/Canon/Memory только в своих статусах", () => {
    const page = read(DIR + "page.tsx");
    expect(page).toContain("hasScenes ? (");
    expect(page).toContain('status === "APPROVED" ? (');
    expect(page).toContain('status === "CANON" ? (');
    expect(page).toMatch(/hasDraft && status !== "APPROVED" && status !== "CANON"/);
  });
});

describe("безопасность переключения вкладок", () => {
  const ws = read(DIR + "ChapterWorkspace.tsx");

  it("переключение вкладок не обращается к сети и не запускает ИИ", () => {
    expect(ws).not.toMatch(/fetch\(|ai\/provider|runTrackedAiCall|chat\.completions/);
  });

  it("панели скрываются, а не размонтируются", () => {
    expect(ws).toContain("hidden={s.key !== stage}");
    expect(ws).not.toMatch(/stage === s\.key &&|\{stage === /);
  });

  it("клавиатурная навигация подключена", () => {
    expect(ws).toContain("onKeyDown");
    expect(ws).toContain("nextTabIndex");
    expect(ws).toContain("overflowX");
  });

  it("редактор предупреждает о несохранённом тексте при закрытии страницы", () => {
    const editor = read(DIR + "DraftEditor.tsx");
    expect(editor).toContain("beforeunload");
    expect(editor).toContain("const dirty = !saved && text !== initialText");
  });

  it("новые файлы не затрагивают провайдера, бюджет и схему", () => {
    for (const f of ["src/lib/ux/chapterWorkspace.ts", "src/lib/chapters/loadChapterPage.ts", DIR + "ChapterWorkspace.tsx", DIR + "page.tsx", DIR + "PlanViews.tsx"]) {
      expect(read(f), f).not.toMatch(/AI_API_KEY|aiBudget|aiModelPrice|getOpenAIClient|\.(create|update|upsert|delete)\(/);
    }
  });
});
