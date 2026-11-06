import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" } as any,
  project: { id: "p1", name: "Параллакс" } as any,
  chapter: null as any,
  reserveOk: true,
  requests: [] as any[],
  runs: [] as any[],
  reports: [] as any[],
  chapterUpdates: [] as any[],
  output: "",
  usage: { input_tokens: 1000, output_tokens: 500 } as any,
  narrative: { promptBlock: "\n[БЛОК ВЕХ]", isEmpty: false } as any,
}));

vi.mock("@/auth", () => ({ auth: async () => (h.user ? { user: h.user } : null) }));
vi.mock("@/lib/context/storyState", () => ({ buildStoryState: async () => "СОСТОЯНИЕ ИСТОРИИ" }));
vi.mock("@/lib/authorIntent/load", () => ({ loadAuthorDirectionBlock: async () => "" }));
vi.mock("@/lib/plotMap/loadNarrative", () => ({ loadNarrativeContext: async () => h.narrative }));
vi.mock("@/lib/ai/provider", () => ({
  hasOpenAIKey: () => true,
  getOpenAIClient: () => ({
    responses: {
      create: async (req: any) => {
        h.requests.push(req);
        return { output_text: h.output, usage: h.usage };
      },
    },
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $executeRawUnsafe: async () => 1,
    $queryRawUnsafe: async () => (h.reserveOk ? [{ id: "m1" }] : []),
    aiModelPrice: { findMany: async () => [{ inputPer1M: 0.2, outputPer1M: 1.2, cachedInputPer1M: 0.02, effectiveFrom: new Date("2026-01-01") }] },
    aiBudget: { findUnique: async () => ({ monthlyLimitUsd: 50 }) },
    aiRun: { create: async ({ data }: any) => (h.runs.push(data), data) },
    project: { findFirst: async () => h.project },
    chapter: {
      findFirst: async () => h.chapter,
      update: async (a: any) => (h.chapterUpdates.push(a), {}),
    },
    canonFact: { findMany: async () => [{ statement: "Салим жив", negation: false }] },
    continuityReport: {
      create: async ({ data }: any) => {
        h.reports.push(data);
        return { id: "r1", issues: (data.issues?.create ?? []).map((i: any, n: number) => ({ id: `i${n}`, ...i })) };
      },
    },
  },
}));

import { POST } from "../src/app/api/projects/[id]/chapters/[chapterId]/continuity/plan/route";
import { AI_LIMITS, limitsFor } from "../src/lib/ai/limits";
import { PLANNER_FUTURE_RULES } from "../src/lib/plotMap/plannerRules";
import { PLAN_CHECK_LEVEL, PLAN_CHECK_ROLE, formatScenes, hasPlanToCheck, parsePlanReport, severityToRow } from "../src/lib/continuity/planCheck";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ctx = { params: Promise.resolve({ id: "p1", chapterId: "c1" }) };
const call = () => POST(new Request("http://x", { method: "POST" }), ctx);
const chapter = (o: any = {}) => ({
  id: "c1", bookId: "b1", number: 2, title: "Г", purpose: "цель", authorIdea: "идея", status: "PLANNED",
  plan: { mustHappen: ["А"], mustNotHappen: ["Б"] }, planApproved: true, draftText: null,
  book: { id: "b1", number: 1, title: "К", projectId: "p1" },
  scenes: [{ order: 1, title: "Сцена", purpose: "п", plan: ["шаг"], plannedOutcome: "р" }],
  ...o,
});
const okReport = { status: "WARN", issues: [{ severity: "HIGH", type: "CANON", location: "mustHappen", problem: "Противоречит Canon", evidence: "Салим жив", recommendation: "Уточнить" }, { severity: "LOW", type: "STYLE", location: "сцена 1", problem: "Мелочь", evidence: "-", recommendation: "-" }], summary: "Есть вопросы" };

beforeEach(() => {
  h.user = { id: "u1" }; h.project = { id: "p1", name: "Параллакс" }; h.chapter = chapter();
  h.reserveOk = true; h.requests = []; h.runs = []; h.reports = []; h.chapterUpdates = [];
  h.output = JSON.stringify(okReport); h.narrative = { promptBlock: "\n[БЛОК ВЕХ]", isEmpty: false };
});

describe("Pre-Writer Continuity: доступ и входные данные", () => {
  it("без входа 401, чужой проект 404, нет главы 404", async () => {
    h.user = null;
    expect((await call()).status).toBe(401);
    h.user = { id: "u1" }; h.project = null;
    expect((await call()).status).toBe(404);
    h.project = { id: "p1", name: "П" }; h.chapter = null;
    expect((await call()).status).toBe(404);
    expect(h.requests).toHaveLength(0);
  });

  it("нет ни плана, ни сцен: 400 и платного вызова нет", async () => {
    h.chapter = chapter({ plan: null, scenes: [] });
    const res = await call();
    expect(res.status).toBe(400);
    expect(h.requests).toHaveLength(0);
    expect(h.runs).toHaveLength(0);
  });

  it("работает без черновика: достаточно плана (или только сцен)", async () => {
    h.chapter = chapter({ draftText: null, scenes: [] });
    expect((await call()).status).toBe(200);
    h.chapter = chapter({ plan: null, draftText: "" });
    expect((await call()).status).toBe(200);
  });
});

describe("Pre-Writer Continuity: что видит модель", () => {
  it("план, сцены, Canon, состояние истории и сюжетная карта; черновика в запросе нет", async () => {
    h.chapter = chapter({ draftText: "СЕКРЕТНЫЙ ЧЕРНОВИК" });
    await call();
    const [sys, user] = h.requests[0].input.map((m: any) => m.content as string);
    expect(sys).toContain("Pre-Writer");
    expect(user).toContain("mustNotHappen");
    expect(user).toContain("Сцена 1");
    expect(user).toContain("Салим жив");
    expect(user).toContain("СОСТОЯНИЕ ИСТОРИИ");
    expect(user).toContain("[БЛОК ВЕХ]");
    expect(user).not.toContain("ЧЕРНОВИК ГЛАВЫ");
    expect(user).not.toContain("СЕКРЕТНЫЙ ЧЕРНОВИК");
  });

  it("потолок ответа и строгая схема берутся из лимитов новой роли", async () => {
    await call();
    expect(h.requests[0].max_output_tokens).toBe(limitsFor(PLAN_CHECK_ROLE).maxOutputTokens);
    expect(h.requests[0].text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(AI_LIMITS.CONTINUITY_PLAN).toBeDefined();
  });
});

describe("Pre-Writer Continuity: результат и защита", () => {
  it("отчёт сохраняется с level 0, замечания переведены в строки; статус главы и Canon не меняются", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.status).toBe("WARN");
    expect(body.report.issues).toHaveLength(2);
    expect(h.reports[0].level).toBe(PLAN_CHECK_LEVEL);
    expect(PLAN_CHECK_LEVEL).toBe(0);
    expect(h.reports[0].issues.create[0]).toMatchObject({ alertType: "ERROR", priority: "CRITICAL", category: "CANON" });
    expect(h.chapterUpdates).toHaveLength(0);
  });

  it("учёт расходов: одна запись AiRun с ролью CONTINUITY_PLAN и реальными токенами", async () => {
    await call();
    expect(h.runs).toHaveLength(1);
    expect(h.runs[0]).toMatchObject({ roleKey: "CONTINUITY_PLAN", inputTokens: 1000, outputTokens: 500, costStatus: "KNOWN" });
  });

  it("лимит бюджета исчерпан: 429, модель не вызвана", async () => {
    h.reserveOk = false;
    const res = await call();
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("BUDGET_EXCEEDED");
    expect(h.requests).toHaveLength(0);
  });

  it("слишком большой план: 413 до платного вызова", async () => {
    h.chapter = chapter({ plan: { mustHappen: ["а".repeat(limitsFor(PLAN_CHECK_ROLE).maxInputTokens * 2 + 10)] } });
    const res = await call();
    expect(res.status).toBe(413);
    expect(h.requests).toHaveLength(0);
  });

  it("некорректный ответ модели: 500 и отчёт не сохраняется", async () => {
    h.output = "не json";
    expect((await call()).status).toBe(500);
    h.output = JSON.stringify({ status: "МАЛО", issues: [], summary: "" });
    expect((await call()).status).toBe(500);
    expect(h.reports).toHaveLength(0);
  });
});

describe("Pre-Writer Continuity: чистые функции", () => {
  it("hasPlanToCheck", () => {
    expect(hasPlanToCheck(null, [])).toBe(false);
    expect(hasPlanToCheck({}, [])).toBe(false);
    expect(hasPlanToCheck([], [])).toBe(false);
    expect(hasPlanToCheck({ a: 1 }, [])).toBe(true);
    expect(hasPlanToCheck(null, [{}])).toBe(true);
  });
  it("parsePlanReport отвергает неверную форму", () => {
    expect(parsePlanReport(JSON.stringify(okReport))?.issues).toHaveLength(2);
    expect(parsePlanReport("{")).toBeNull();
    expect(parsePlanReport(JSON.stringify({ status: "PASS", issues: [{ severity: "X" }], summary: "" }))).toBeNull();
    expect(parsePlanReport(JSON.stringify({ status: "PASS", issues: [], summary: 5 }))).toBeNull();
  });
  it("severityToRow и formatScenes", () => {
    expect(severityToRow("HIGH")).toEqual({ alertType: "ERROR", priority: "CRITICAL" });
    expect(severityToRow("MEDIUM")).toEqual({ alertType: "WARNING", priority: "IMPORTANT" });
    expect(severityToRow("LOW")).toEqual({ alertType: "WARNING", priority: "USEFUL" });
    expect(formatScenes([{ order: 2, title: "Т", purpose: "п", plan: ["а", "б"], plannedOutcome: "р" }])).toContain("Сцена 2: Т");
  });
});

describe("Architect и Scene Planner получают сюжетную карту", () => {
  const D = "src/app/api/projects/[id]/chapters/[chapterId]/";
  for (const name of ["architect", "scene-planner"]) {
    it(`${name}: Narrative Context и правила планирования в запросе`, () => {
      const src = read(D + name + "/route.ts");
      expect(src).toContain("loadNarrativeContext");
      expect(src).toContain("PLANNER_FUTURE_RULES");
      expect(src).toContain("${narrative.promptBlock}");
    });
  }
  it("правила: будущее — ориентир, не факт; не переносить события и не раскрывать тайны раньше срока", () => {
    expect(PLANNER_FUTURE_RULES).toContain("не как свершившиеся факты");
    expect(PLANNER_FUTURE_RULES).toContain("Не переноси события будущих вех");
    expect(PLANNER_FUTURE_RULES).toContain("openQuestions");
  });
  it("Writer не изменился, а отчёты плана не попадают в предложения исправлений текста", () => {
    expect(read(D + "continuity/suggestions/route.ts")).toContain("level: { gt: 0 }");
    expect(read(D + "writer/route.ts")).toContain("${storyState}${authorBlock}${narrative.promptBlock}");
  });
  it("новый маршрут ничего не пишет в Canon и в статус главы", () => {
    const src = read(D + "continuity/plan/route.ts");
    expect(src).not.toMatch(/canon\/write|applyProposal|canonFact\.(create|update|upsert|delete)|chapter\.update|proposal\./);
  });
});
