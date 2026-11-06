/**
 * Pre-Writer Continuity: проверка утверждённого плана главы и плана сцен
 * ДО написания текста. Проверяет то, что можно проверить без черновика:
 * согласованность плана с Canon, состоянием истории и сюжетной картой,
 * покрытие плана сценами, логику и ограничения на раскрытие тайн.
 *
 * Не заменяет проверку готового текста (Post-Writer Continuity): у неё другие
 * входные данные и другие критерии. Ничего не пишет в Canon.
 */

export const PLAN_CHECK_ROLE = "CONTINUITY_PLAN";
/** 0 = проверка плана; 1 и 2 заняты проверками текста (детерминированной и семантической). */
export const PLAN_CHECK_LEVEL = 0;

export type PlanSceneInput = {
  order: number;
  title: string | null;
  purpose: string | null;
  plan: unknown;
  plannedOutcome: string | null;
};

export function formatScenes(scenes: PlanSceneInput[]): string {
  return scenes
    .map((s) => {
      const steps = Array.isArray(s.plan) ? s.plan.map(String).join("\n") : String(s.plan ?? "");
      return `Сцена ${s.order}: ${s.title ?? ""}\nНазначение: ${s.purpose ?? ""}\nПлан:\n${steps}\nЗапланированный результат: ${s.plannedOutcome ?? ""}`;
    })
    .join("\n\n");
}

/** Есть ли что проверять: план главы с содержимым или хотя бы одна сцена. */
export function hasPlanToCheck(plan: unknown, scenes: unknown[]): boolean {
  const planFilled = !!plan && typeof plan === "object" && !Array.isArray(plan) && Object.keys(plan as object).length > 0;
  return planFilled || scenes.length > 0;
}

export const PLAN_CHECK_SYSTEM_PROMPT = `
Ты — Pre-Writer Continuity Checker в системе Story Architect.

Глава ещё НЕ написана. Тебе дан утверждённый план главы и (если есть) план сцен.
Твоя задача — найти проблемы в плане до того, как по нему начнут писать текст.

Ты НЕ пишешь текст и НЕ переписываешь план.
Ты НЕ изменяешь Canon и НЕ добавляешь новые факты.
Ты только создаёшь отчёт для автора.

Проверяй:
1. Противоречия плана подтверждённым Canon Facts.
2. Противоречия плану состоянию истории на начало главы (кто где, жив ли, что знает, отношения).
3. План сцен и план главы: покрыто ли всё из mustHappen, нет ли сцен, нарушающих mustNotHappen,
   ведут ли сцены от initialState к endState.
4. Порядок и причинность: нет ли сцены, которая опирается на событие, которого ещё не было.
5. Знание персонажей: не действуют ли они на основе информации, которой у них ещё нет.
6. Сюжетная карта: не перенесено ли в эту главу событие будущей вехи; не завершена ли линия раньше срока.
7. Тайны: не запланировано ли раскрытие глубже допустимого для этой главы уровня.
8. Пробелы: что нужно решить автору до написания (но не придумывай решения за него).

Не придирайся к стилю и не оценивай, насколько интересен замысел.
Не придумывай проблему без достаточных оснований; ссылайся на конкретное место плана и на то,
с чем оно расходится.

Каждая проблема: severity (HIGH / MEDIUM / LOW), type, location (где в плане),
problem, evidence (на что опираешься), recommendation (что решить автору).

status: PASS — существенных проблем нет; WARN — есть вопросы к автору; FAIL — план противоречит Canon,
состоянию истории или ограничениям.

Верни ТОЛЬКО JSON по схеме.
`.trim();

export type PlanCheckPromptInput = {
  projectName: string;
  chapterNumber: number;
  chapterTitle: string | null;
  purpose: string | null;
  authorIdea: string | null;
  plan: unknown;
  scenes: PlanSceneInput[];
  canonFacts: { statement: string; negation: boolean }[];
  storyState: string;
  authorBlock: string;
  narrativeBlock: string;
};

export function buildPlanCheckUserPrompt(i: PlanCheckPromptInput): string {
  const plan = i.plan && typeof i.plan === "object" ? JSON.stringify(i.plan, null, 2) : "План главы не задан.";
  const canon = i.canonFacts.length ? i.canonFacts.map((f, n) => `${n + 1}. ${f.negation ? "НЕ " : ""}${f.statement}`).join("\n") : "Подтверждённых Canon Facts пока нет.";
  return `
ПРОЕКТ:
${i.projectName}

ГЛАВА:
${i.chapterNumber}. ${i.chapterTitle ?? ""}

ЦЕЛЬ ГЛАВЫ:
${i.purpose ?? ""}

ИДЕЯ АВТОРА:
${i.authorIdea ?? ""}

УТВЕРЖДЁННЫЙ ПЛАН ГЛАВЫ:
${plan}

ПЛАН СЦЕН:
${i.scenes.length ? formatScenes(i.scenes) : "План сцен отсутствует."}

CANON FACTS:
${canon}

СОСТОЯНИЕ ИСТОРИИ НА НАЧАЛО ГЛАВЫ:
${i.storyState}${i.authorBlock}${i.narrativeBlock}
`;
}

export const PLAN_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["PASS", "WARN", "FAIL"] },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          type: { type: "string" },
          location: { type: "string" },
          problem: { type: "string" },
          evidence: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["severity", "type", "location", "problem", "evidence", "recommendation"],
      },
    },
    summary: { type: "string" },
  },
  required: ["status", "issues", "summary"],
} as const;

export type PlanIssue = { severity: "HIGH" | "MEDIUM" | "LOW"; type: string; location: string; problem: string; evidence: string; recommendation: string };
export type PlanReport = { status: "PASS" | "WARN" | "FAIL"; issues: PlanIssue[]; summary: string };

/** Проверка формы ответа модели; null, если ответ не соответствует схеме. */
export function parsePlanReport(text: string): PlanReport | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (!["PASS", "WARN", "FAIL"].includes(String(r.status)) || !Array.isArray(r.issues) || typeof r.summary !== "string") return null;
  const issues: PlanIssue[] = [];
  for (const it of r.issues) {
    if (!it || typeof it !== "object") return null;
    const x = it as Record<string, unknown>;
    if (!["HIGH", "MEDIUM", "LOW"].includes(String(x.severity))) return null;
    issues.push({
      severity: x.severity as PlanIssue["severity"],
      type: String(x.type ?? ""),
      location: String(x.location ?? ""),
      problem: String(x.problem ?? ""),
      evidence: String(x.evidence ?? ""),
      recommendation: String(x.recommendation ?? ""),
    });
  }
  return { status: r.status as PlanReport["status"], issues, summary: r.summary };
}

export function severityToRow(severity: PlanIssue["severity"]): { alertType: "ERROR" | "WARNING"; priority: "CRITICAL" | "IMPORTANT" | "USEFUL" } {
  if (severity === "HIGH") return { alertType: "ERROR", priority: "CRITICAL" };
  if (severity === "MEDIUM") return { alertType: "WARNING", priority: "IMPORTANT" };
  return { alertType: "WARNING", priority: "USEFUL" };
}
