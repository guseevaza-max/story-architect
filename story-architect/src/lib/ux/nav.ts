import { recommend, stageHref, type StageKey } from "./chapterWorkspace";

/**
 * p36: навигация проекта и «следующая задача» для рабочего стола.
 * Чистые функции без обращений к базе и ИИ: их легко тестировать, а список
 * разделов в одном месте гарантирует, что ни один прежний раздел не потерян.
 */

export type NavGroupKey = "dashboard" | "books" | "universe" | "plot" | "decisions";

export type NavItem = { key: string; label: string; href: string; hint: string; section?: string };
export type NavGroup = { key: NavGroupKey; label: string; href: string; items: NavItem[] };

/** Разделы по направлениям (docs/ux/navigation-proposal.md §2). */
export function navGroups(projectId: string): NavGroup[] {
  const p = `/projects/${projectId}`;
  const item = (key: string, label: string, path: string, hint: string, section?: string): NavItem => ({ key, label, href: `${p}${path}`, hint, ...(section ? { section } : {}) });
  return [
    {
      key: "dashboard",
      label: "Рабочий стол",
      href: p,
      items: [item("dashboard", "Рабочий стол", "", "Состояние проекта и следующий шаг")],
    },
    {
      key: "books",
      label: "Книги и главы",
      href: `${p}/chapters`,
      items: [item("chapters", "Главы", "/chapters", "Планирование, текст, проверка и утверждение")],
    },
    {
      key: "universe",
      label: "Вселенная",
      href: `${p}/story-bible`,
      items: [
        item("story-bible", "Story Bible", "/story-bible", "Авторский текст о мире и его анализ", "Материалы"),
        item("lore", "Материалы мира", "/lore", "Исходные заметки и извлечение фактов", "Материалы"),
        item("references", "Референсы", "/references", "Литературные ориентиры автора", "Материалы"),
        item("characters", "Персонажи", "/characters", "Утверждённые персонажи", "Сущности"),
        item("world", "Мир", "/world", "Сущности и правила мира", "Сущности"),
        item("relationships", "Отношения", "/relationships", "Связи между персонажами и их история", "Сущности"),
        item("canon", "Canon", "/canon", "Утверждённые факты", "Canon и память"),
        item("memory", "Память", "/memory", "Сводки глав и память истории", "Canon и память"),
      ],
    },
    {
      key: "plot",
      label: "Сюжет",
      href: `${p}/plot-map`,
      items: [
        item("plot-map", "Сюжетная карта", "/plot-map", "Замысел книги, вехи, тайны", "Сюжет"),
        item("plot-lines", "Сюжетные линии", "/plot-lines", "Линии и их этапы", "Сюжет"),
        item("timeline", "Хронология", "/timeline", "События во времени", "Сюжет"),
      ],
    },
    {
      key: "decisions",
      label: "Центр решений",
      href: `${p}/proposals`,
      items: [item("proposals", "Предложения AI", "/proposals", "Принять, исправить или отклонить")],
    },
  ];
}

/** Дополнительные инструменты: экспорт внутри проекта, расходы ИИ вне проекта. */
export function navTools(projectId: string): NavItem[] {
  return [
    { key: "export", label: "Экспорт PDF", href: `/projects/${projectId}/export`, hint: "Книга в PDF" },
    { key: "ai-usage", label: "Расходы ИИ", href: "/ai-usage", hint: "Бюджет и стоимость запросов" },
  ];
}

/** Все адреса навигации (для проверки, что ничего не потеряно). */
export function allNavHrefs(projectId: string): string[] {
  return [...navGroups(projectId).flatMap((g) => g.items.map((i) => i.href)), ...navTools(projectId).map((t) => t.href)];
}

/** К какому направлению относится адрес. null — вне навигации (экспорт, чужие адреса). */
export function activeGroup(pathname: string, projectId: string): NavGroupKey | null {
  const base = `/projects/${projectId}`;
  if (pathname === base || pathname === `${base}/`) return "dashboard";
  if (!pathname.startsWith(`${base}/`)) return null;
  const section = pathname.slice(base.length + 1).split("/")[0];
  for (const g of navGroups(projectId)) {
    if (g.key === "dashboard") continue;
    if (g.items.some((i) => i.href === `${base}/${section}`)) return g.key;
  }
  return null;
}

/** Адрес активного раздела (для подсветки подпункта). */
export function activeItemKey(pathname: string, projectId: string): string | null {
  const base = `/projects/${projectId}`;
  if (pathname === base || pathname === `${base}/`) return "dashboard";
  const section = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1).split("/")[0] : "";
  for (const g of navGroups(projectId)) {
    const found = g.items.find((i) => i.href === `${base}/${section}`);
    if (found) return found.key;
  }
  return null;
}

export type NavSection = { label: string; href: string; items: NavItem[] };

/** Разделы направления: страницы с одинаковым section собраны вместе, порядок сохранён. */
export function navSections(projectId: string, groupKey: NavGroupKey): NavSection[] {
  const group = navGroups(projectId).find((g) => g.key === groupKey);
  if (!group) return [];
  const out: NavSection[] = [];
  for (const i of group.items) {
    const label = i.section ?? i.label;
    const found = out.find((s) => s.label === label);
    if (found) found.items.push(i);
    else out.push({ label, href: i.href, items: [i] });
  }
  return out;
}

/**
 * Раздел, к которому относится адрес: его страницы показываются вкладками над содержимым.
 * null, если адрес вне навигации.
 */
export function activeSection(pathname: string, projectId: string): NavSection | null {
  const group = activeGroup(pathname, projectId);
  const key = activeItemKey(pathname, projectId);
  if (!group || !key) return null;
  return navSections(projectId, group).find((s) => s.items.some((i) => i.key === key)) ?? null;
}

/** Печать и экспорт: навигация и панель Соавтора не нужны. */
export function isNavHidden(pathname: string): boolean {
  return /\/export(\/|$)/.test(pathname);
}

// ───────────────────────── следующая задача ─────────────────────────

export const STATUS_LABEL: Record<string, string> = {
  IDEA: "Идея",
  PLANNED: "Запланирована",
  DRAFT: "Черновик",
  EDITING: "Редактирование",
  CHECKING: "Проверка",
  APPROVED: "Утверждена",
  CANON: "Canon",
};

export type ChapterBrief = {
  id: string;
  number: number;
  title: string | null;
  status: string;
  planApproved: boolean;
  sceneCount: number;
  hasDraft: boolean;
  hasMemory: boolean;
  words?: number;
  hasIdea?: boolean;
  hasIntent?: boolean;
  /** Ожидающие решения предложения плана главы/плана сцен именно этой главы. */
  pendingPlan?: number;
};

/** Вкладка, с которой удобнее продолжить эту главу (то же правило, что на странице главы). */
export function chapterTab(c: ChapterBrief): StageKey {
  return recommend({
    status: c.status,
    hasIdea: !!c.hasIdea,
    hasIntent: !!c.hasIntent,
    planApproved: c.planApproved,
    sceneCount: c.sceneCount,
    hasDraft: c.hasDraft,
    pendingPlanProposals: c.pendingPlan ?? 0,
  }).stage;
}

/**
 * Какие главы показать в ряду на рабочем столе: окно вокруг первой
 * незавершённой главы (одна предыдущая для контекста), не больше max.
 */
export function visibleChapters<T extends Pick<ChapterBrief, "number" | "status">>(chapters: T[], max = 12): T[] {
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  if (sorted.length <= max) return sorted;
  const firstOpen = sorted.findIndex((c) => c.status !== "CANON");
  const start = firstOpen < 0 ? Math.max(0, sorted.length - max) : Math.max(0, firstOpen - 1);
  return sorted.slice(start, start + max);
}

export type NextTask = { title: string; text: string; href: string; chapterId: string | null };

const chapterName = (c: ChapterBrief) => `глава ${c.number}${c.title ? ` «${c.title}»` : ""}`;

/**
 * Что можно сделать дальше. Это подсказка, а не обязательный шаг: автор вправе
 * идти любым путём. Платных действий функция не запускает.
 */
export function nextTask(projectId: string, chapters: ChapterBrief[], pendingProposals: number): NextTask {
  const base = `/projects/${projectId}`;
  const chapterHref = (c: ChapterBrief, stage?: StageKey) => (stage ? stageHref(`${base}/chapters/${c.id}`, stage) : `${base}/chapters/${c.id}`);
  const sorted = [...chapters].sort((a, b) => a.number - b.number);

  if (sorted.length === 0) {
    return { title: "Создать первую главу", text: "В проекте пока нет глав.", href: `${base}/chapters`, chapterId: null };
  }

  const needsMemory = sorted.find((c) => c.status === "CANON" && !c.hasMemory);
  const open = sorted.find((c) => c.status !== "CANON");

  if (!open) {
    if (needsMemory) {
      return { title: `Обновить память: ${chapterName(needsMemory)}`, text: "Глава в Canon, но изменения памяти ещё не извлекались.", href: chapterHref(needsMemory, "finish"), chapterId: needsMemory.id };
    }
    return { title: "Создать следующую главу", text: "Все существующие главы уже в Canon.", href: `${base}/chapters`, chapterId: null };
  }

  if (open.status === "APPROVED") {
    return { title: `Перевести в Canon: ${chapterName(open)}`, text: "Глава утверждена, но ещё не добавлена в Canon.", href: chapterHref(open, "finish"), chapterId: open.id };
  }
  if (open.hasDraft) {
    if (open.status === "CHECKING") {
      return { title: `Утвердить: ${chapterName(open)}`, text: "Проверка выполнена. Если текст устраивает, утвердите главу.", href: chapterHref(open, "finish"), chapterId: open.id };
    }
    return { title: `Проверить: ${chapterName(open)}`, text: "Текст есть, а проверки ещё не было. Проверьте главу или сразу утвердите её.", href: chapterHref(open, "analysis"), chapterId: open.id };
  }
  if ((open.pendingPlan ?? 0) > 0) {
    return { title: `Рассмотреть план: ${chapterName(open)}`, text: "План или сцены уже подготовлены и ждут вашего решения. Запускать ИИ повторно не нужно.", href: `${base}/proposals`, chapterId: open.id };
  }
  if (open.planApproved && open.sceneCount > 0) {
    return { title: `Написать текст: ${chapterName(open)}`, text: "План и сцены утверждены. Текст можно сгенерировать или написать вручную.", href: chapterHref(open, "draft"), chapterId: open.id };
  }
  if (open.planApproved) {
    return { title: `План сцен: ${chapterName(open)}`, text: "План главы утверждён. Следующий шаг: разбить его на сцены.", href: chapterHref(open, "planning"), chapterId: open.id };
  }
  if (pendingProposals > 0) {
    return { title: "Рассмотреть предложения", text: `Ждёт решения предложений: ${pendingProposals}. Среди них может быть план главы.`, href: `${base}/proposals`, chapterId: null };
  }
  const started = !!open.hasIdea || !!open.hasIntent;
  return {
    title: `Спланировать: ${chapterName(open)}`,
    text: started ? "Замысел записан. Можно получить план главы." : "Запишите идею и замысел главы, затем переходите к плану.",
    href: chapterHref(open, started ? "planning" : "intent"),
    chapterId: open.id,
  };
}

export function chapterStatusCounts(chapters: Pick<ChapterBrief, "status">[]): { status: string; label: string; count: number }[] {
  const order = Object.keys(STATUS_LABEL);
  const counts = new Map<string, number>();
  for (const c of chapters) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  return order.filter((s) => counts.has(s)).map((s) => ({ status: s, label: STATUS_LABEL[s]!, count: counts.get(s)! }));
}

export function countWords(text: string | null | undefined): number {
  const t = (text ?? "").trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Подпись типа предложения для сводки. */
export function proposalKindLabel(entityType: string): string {
  const map: Record<string, string> = {
    chapter_plan: "планы глав",
    scene_plan: "планы сцен",
    LORE_FACT: "факты Lore",
    CHARACTER: "персонажи",
    WORLD_ENTITY: "сущности мира",
    WORLD_RULE: "правила мира",
    PLOT_LINE: "сюжетные линии",
    EVENT: "события",
    OPEN_QUESTION: "открытые вопросы",
  };
  return map[entityType] ?? "прочее";
}
