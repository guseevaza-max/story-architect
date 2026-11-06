import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextUnfinishedChapter, parseStage, recommend, stageHref, tabParam, type ChapterFacts, type ChapterRef } from "../src/lib/ux/chapterWorkspace";
import { nextTask, type ChapterBrief } from "../src/lib/ux/nav";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const facts = (o: Partial<ChapterFacts> = {}): ChapterFacts => ({ status: "IDEA", hasIdea: false, hasIntent: false, planApproved: false, sceneCount: 0, hasDraft: false, pendingPlanProposals: 0, ...o });
const brief = (o: Partial<ChapterBrief> = {}): ChapterBrief => ({ id: "c1", number: 1, title: null, status: "IDEA", planApproved: false, sceneCount: 0, hasDraft: false, hasMemory: false, ...o });

describe("«Продолжить работу»: адрес вкладки", () => {
  it("?tab= принимает intent|planning|draft|analysis|completion, старый ?stage=finish тоже", () => {
    expect(["intent", "planning", "draft", "analysis", "completion"].map(parseStage)).toEqual(["intent", "planning", "draft", "analysis", "finish"]);
    expect(parseStage("finish")).toBe("finish");
    expect(parseStage("x")).toBeNull();
    expect(tabParam("finish")).toBe("completion");
    expect(stageHref("/projects/p/chapters/c", "finish")).toBe("/projects/p/chapters/c?tab=completion");
    expect(stageHref("/projects/p/chapters/c", "analysis")).toBe("/projects/p/chapters/c?tab=analysis");
  });
});

describe("рекомендуемая вкладка", () => {
  it("черновик без подтверждённой проверки → Анализ", () => {
    expect(recommend(facts({ hasDraft: true, status: "DRAFT" })).stage).toBe("analysis");
  });
  it("проверка уже выполнена (CHECKING) → Завершение", () => {
    expect(recommend(facts({ hasDraft: true, status: "CHECKING" })).stage).toBe("finish");
  });
  it("ожидающий план или сцены → Планирование, без повторного платного запуска", () => {
    const r = recommend(facts({ pendingPlanProposals: 1, planApproved: true, sceneCount: 0 }));
    expect(r.stage).toBe("planning");
    expect(r.text).toContain("Запускать ИИ повторно не нужно");
    expect(recommend(facts({ pendingPlanProposals: 2, planApproved: true, sceneCount: 3 })).stage).toBe("planning");
  });
  it("прежние ветки: нет замысла → Замысел; замысел → Планирование; план и сцены → Черновик; APPROVED/CANON → Завершение", () => {
    expect(recommend(facts()).stage).toBe("intent");
    expect(recommend(facts({ hasIdea: true })).stage).toBe("planning");
    expect(recommend(facts({ planApproved: true, sceneCount: 2 })).stage).toBe("draft");
    expect(recommend(facts({ status: "APPROVED" })).stage).toBe("finish");
    expect(recommend(facts({ status: "CANON" })).stage).toBe("finish");
  });
});

describe("рабочий стол: ссылки ведут на нужную вкладку", () => {
  const go = (c: Partial<ChapterBrief>, pending = 0) => nextTask("p", [brief(c)], pending);
  it("черновик без проверки → ?tab=analysis; после проверки → completion", () => {
    expect(go({ hasDraft: true, status: "DRAFT" }).href).toBe("/projects/p/chapters/c1?tab=analysis");
    expect(go({ hasDraft: true, status: "CHECKING" }).href).toBe("/projects/p/chapters/c1?tab=completion");
  });
  it("утверждённая глава → completion", () => {
    expect(go({ status: "APPROVED", hasDraft: true }).href).toBe("/projects/p/chapters/c1?tab=completion");
  });
  it("ожидающий план/сцены главы → Центр решений, а не повторный запуск Architect/Scene Planner", () => {
    const t = go({ pendingPlan: 1, planApproved: true, sceneCount: 0 });
    expect(t.href).toBe("/projects/p/proposals");
    expect(t.title).toContain("Рассмотреть план");
    expect(t.text).toContain("повторно не нужно");
  });
  it("план и сцены → draft; только план → planning; идея есть → planning; ничего нет → intent", () => {
    expect(go({ planApproved: true, sceneCount: 2 }).href).toContain("?tab=draft");
    expect(go({ planApproved: true }).href).toContain("?tab=planning");
    expect(go({ hasIdea: true }).href).toContain("?tab=planning");
    expect(go({}).href).toContain("?tab=intent");
  });
  it("после завершения главы стол предлагает следующую незавершённую", () => {
    const t = nextTask("p", [brief({ id: "a", number: 1, status: "CANON", hasMemory: true }), brief({ id: "b", number: 2, status: "IDEA" })], 0);
    expect(t.chapterId).toBe("b");
  });
});

describe("следующая незавершённая глава (на странице главы)", () => {
  const ch = (id: string, number: number, status: string, bookNumber = 1): ChapterRef => ({ id, number, title: null, status, bookNumber });
  it("берёт ближайшую после текущей, не в Canon", () => {
    expect(nextUnfinishedChapter([ch("a", 1, "CANON"), ch("b", 2, "CANON"), ch("c", 3, "CANON"), ch("d", 4, "DRAFT")], "b")?.id).toBe("d");
    expect(nextUnfinishedChapter([ch("c", 3, "IDEA"), ch("a", 1, "CANON"), ch("b", 2, "CANON")], "a")?.id).toBe("c");
  });
  it("учитывает номер книги", () => {
    expect(nextUnfinishedChapter([ch("a", 5, "CANON", 1), ch("b", 1, "IDEA", 2)], "a")?.id).toBe("b");
  });
  it("если после текущей всё в Canon, предлагает более раннюю незавершённую", () => {
    expect(nextUnfinishedChapter([ch("a", 1, "IDEA"), ch("b", 2, "CANON")], "b")?.id).toBe("a");
  });
  it("если незавершённых нет — null", () => {
    expect(nextUnfinishedChapter([ch("a", 1, "CANON"), ch("b", 2, "CANON")], "b")).toBeNull();
    expect(nextUnfinishedChapter([ch("a", 1, "CANON")], "a")).toBeNull();
  });
});

describe("безопасность и подписи", () => {
  it("переходы только читают: функции навигации не обращаются к ИИ и базе", () => {
    for (const f of ["src/lib/ux/nav.ts", "src/lib/ux/chapterWorkspace.ts"]) expect(read(f)).not.toMatch(/fetch\(|prisma\.|runTrackedAiCall|openai/i);
  });
  it("страница главы читает ?tab= (и прежний ?stage=); старый вид остался", () => {
    const page = read("src/app/projects/[id]/chapters/[chapterId]/page.tsx");
    expect(page).toContain("parseStage(query.tab)");
    expect(page).toContain("parseStage(query.stage)");
    expect(read("src/app/projects/[id]/chapters/[chapterId]/legacy/page.tsx")).toContain("Вернуться к новому виду");
  });
  it("на главном экране нет технических пояснений", () => {
    const view = read("src/app/projects/[id]/_components/ProjectSummaryView.tsx");
    const proj = read("src/app/projects/[id]/page.tsx");
    const chapter = read("src/app/projects/[id]/chapters/[chapterId]/page.tsx");
    expect(view).toContain("Продолжить работу");
    expect(view).not.toContain("не обязательное действие");
    expect(proj).not.toContain("рабочее пространство проекта");
    expect(proj).not.toContain("Назад в Dashboard");
    expect(chapter).not.toMatch(/этап p38|p38\)/);
  });
  it("сводка читает ожидающие планы только на чтение", () => {
    const s = read("src/lib/ux/summary.ts");
    expect(s).toContain("chapter_plan");
    expect(s).not.toMatch(/\.(create|update|upsert|delete)\(/);
  });
});
