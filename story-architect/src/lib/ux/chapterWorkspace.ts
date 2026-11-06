/**
 * p37: чистая логика рабочего пространства главы. Вкладки (этапы) — это
 * не замки: любую можно открыть в любой момент. Рекомендация лишь подсказывает,
 * с чего удобнее продолжить. Здесь нет обращений к базе и ИИ.
 */

export type StageKey = "intent" | "planning" | "draft" | "analysis" | "finish";

export const STAGES: { key: StageKey; label: string; hint: string }[] = [
  { key: "intent", label: "Замысел", hint: "Назначение, идея, параметры замысла, сюжетный контекст" },
  { key: "planning", label: "Планирование", hint: "Architect, план главы, Scene Planner, план сцен" },
  { key: "draft", label: "Черновик", hint: "Writer и редактор текста" },
  { key: "analysis", label: "Анализ", hint: "Проверка непрерывности и предложения исправлений" },
  { key: "finish", label: "Завершение", hint: "Утверждение, Canon, обновление памяти" },
];

export const STAGE_KEYS: StageKey[] = STAGES.map((s) => s.key);

/**
 * Значение `?tab=` (или прежнего `?stage=`) → этап или null, если оно неизвестно.
 * В адресе последний этап называется `completion`; `finish` тоже принимается.
 */
export function parseStage(value: string | string[] | null | undefined): StageKey | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "completion") return "finish";
  return STAGE_KEYS.find((k) => k === v) ?? null;
}

/** Имя этапа в адресе: intent | planning | draft | analysis | completion. */
export function tabParam(stage: StageKey): string {
  return stage === "finish" ? "completion" : stage;
}

export type ChapterFacts = {
  status: string;
  hasIdea: boolean;
  hasIntent: boolean;
  planApproved: boolean;
  sceneCount: number;
  hasDraft: boolean;
  /** Ожидающие решения предложения плана главы или плана сцен (платный вызов повторять не нужно). */
  pendingPlanProposals: number;
};

export type Recommendation = { stage: StageKey; text: string };

/** С какого этапа удобнее продолжить. Подсказка, а не требование. */
export function recommend(f: ChapterFacts): Recommendation {
  if (f.status === "CANON") return { stage: "finish", text: "Глава в Canon. Если память ещё не обновлена, запустите Memory Update на этапе «Завершение»." };
  if (f.status === "APPROVED") return { stage: "finish", text: "Глава утверждена. Следующий шаг: перевести её в Canon на этапе «Завершение»." };
  if (f.hasDraft && f.status === "CHECKING") return { stage: "finish", text: "Проверка выполнена. Если текст устраивает, утвердите главу на этапе «Завершение»." };
  if (f.hasDraft) return { stage: "analysis", text: "Текст есть, а проверки ещё не было. Проверьте главу или сразу переходите к утверждению." };
  if (f.pendingPlanProposals > 0) return { stage: "planning", text: "План или сцены ждут вашего решения в Центре решений. Запускать ИИ повторно не нужно." };
  if (f.planApproved && f.sceneCount > 0) return { stage: "draft", text: "План и сцены утверждены. Текст можно сгенерировать Writer-ом или написать вручную." };
  if (f.planApproved) return { stage: "planning", text: "План главы утверждён. Следующий шаг: разбить его на сцены." };
  if (f.hasIdea || f.hasIntent) return { stage: "planning", text: "Замысел записан. Можно запустить Architect и получить план главы." };
  return { stage: "intent", text: "Запишите идею главы и параметры замысла, затем переходите к планированию. Писать текст можно и без плана." };
}

export type StageState = "done" | "todo" | "optional";

/** Отметка этапа: ✓ сделано, • можно сделать, «необязательно». Считается по данным. */
export function stageStates(f: ChapterFacts): Record<StageKey, StageState> {
  const finished = f.status === "APPROVED" || f.status === "CANON";
  return {
    intent: f.hasIdea || f.hasIntent ? "done" : "optional",
    planning: f.planApproved && f.sceneCount > 0 ? "done" : "optional",
    draft: f.hasDraft ? "done" : "todo",
    analysis: "optional",
    finish: f.status === "CANON" ? "done" : finished ? "todo" : "todo",
  };
}

/** Куда переместить фокус при нажатии клавиши в списке вкладок; null — клавиша не наша. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** Адрес главы с выбранным этапом: `?tab=intent|planning|draft|analysis|completion`. */
export function stageHref(basePath: string, stage: StageKey): string {
  return `${basePath}?tab=${tabParam(stage)}`;
}

export type ChapterRef = { id: string; number: number; title: string | null; status: string; bookNumber: number };

/**
 * Следующая незавершённая глава (не в Canon): сначала после текущей, затем любая
 * более ранняя. Null, если все остальные главы уже в Canon или других нет.
 */
export function nextUnfinishedChapter(chapters: ChapterRef[], currentId: string): ChapterRef | null {
  const sorted = [...chapters].sort((a, b) => a.bookNumber - b.bookNumber || a.number - b.number);
  const i = sorted.findIndex((c) => c.id === currentId);
  const after = i >= 0 ? sorted.slice(i + 1) : sorted;
  const before = i >= 0 ? sorted.slice(0, i) : [];
  return [...after, ...before].find((c) => c.id !== currentId && c.status !== "CANON") ?? null;
}
