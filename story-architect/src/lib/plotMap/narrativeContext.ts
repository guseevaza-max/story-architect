/**
 * Narrative Context: долгосрочный сюжетный контекст для Writer.
 *
 * Чистая функция без обращений к базе: и Writer, и предпросмотр на странице
 * главы получают результат из одного места, поэтому данные не расходятся.
 *
 * Разделение знаний:
 *  - знание автора/писателя (истина тайн, будущие вехи) нужно ИИ для
 *    планирования и намёков;
 *  - раскрытие читателю определяется уровнем тайны на текущую главу.
 * Знание о будущем не разрешает раскрывать его в тексте.
 *
 * Веха из карты не считается свершившимся фактом и не является Canon.
 * Модуль ничего не пишет в Canon.
 */
import { AUTHOR_NOTES_MARKER } from "../authorIntent/prompt";

export const NEAR_WINDOW = 5;
export const LIMITS = { past: 5, current: 6, near: 8, far: 6, unplaced: 8, secrets: 12, text: 600 } as const;

export type Approval = "APPROVED" | "APPROXIMATE" | "IDEA";
export type BeatDisclosureValue = "HIDDEN" | "HINTED" | "PARTIAL" | "REVEALED";
export type DisclosureLevel = "HIDDEN" | "HINT" | "PARTIAL" | "FULL";

export const LEVEL_LABELS: Record<DisclosureLevel, string> = {
  HIDDEN: "скрыто",
  HINT: "только намёки",
  PARTIAL: "частичное раскрытие",
  FULL: "можно раскрыть",
};

export type NarrativeBookInput = {
  id: string;
  title: string | null;
  number: number;
  premise: string | null;
  mainArc: string | null;
  plannedEnding: string | null;
  themes: string | null;
  centralConflicts: string | null;
  authorConstraints: string | null;
};

export type NarrativeBeatInput = {
  id: string;
  bookId: string | null;
  order: number;
  name: string;
  description: string | null;
  narrativeFunction: string | null;
  causes: string | null;
  consequences: string | null;
  plannedChapterFrom: number | null;
  plannedChapterTo: number | null;
  approval: Approval;
  disclosure: BeatDisclosureValue;
};

export type NarrativeSecretInput = {
  id: string;
  name: string;
  importance: number;
  status: string;
  revealStatus: string;
  objectiveTruth: string | null;
  hintFromChapter: number | null;
  partialRevealChapter: number | null;
  plannedRevealChapter: number | null;
  forbiddenEarly: string | null;
};

export type NarrativeInput = {
  chapterNumber: number;
  book: NarrativeBookInput | null;
  beats: NarrativeBeatInput[];
  secrets: NarrativeSecretInput[];
};

export type BeatView = {
  id: string;
  name: string;
  approval: Approval;
  authority: "approved" | "preliminary";
  disclosure: BeatDisclosureValue;
  chapters: string | null;
  details: string;
};

export type SecretView = {
  id: string;
  name: string;
  level: DisclosureLevel;
  levelLabel: string;
  forbiddenEarly: string | null;
  truthPassed: boolean;
};

export type NarrativePreview = {
  chapterNumber: number;
  bookTitle: string | null;
  bookFields: { label: string; value: string }[];
  constraints: string | null;
  beats: Record<"past" | "current" | "near" | "far" | "unplaced", BeatView[]>;
  omitted: Record<"past" | "current" | "near" | "far" | "unplaced", number>;
  secrets: SecretView[];
  warnings: string[];
};

export type NarrativeContext = {
  /** Пустая строка, если у карты нет ничего, что стоит передать Writer. */
  promptBlock: string;
  isEmpty: boolean;
  preview: NarrativePreview;
};

const clip = (text: string | null | undefined, max: number = LIMITS.text): string => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
};

/** Окно глав вехи; без номеров глав веха «не размещена», номер не выдумывается. */
function beatWindow(beat: NarrativeBeatInput): { from: number; to: number } | null {
  const from = beat.plannedChapterFrom ?? beat.plannedChapterTo;
  const to = beat.plannedChapterTo ?? beat.plannedChapterFrom;
  if (from == null || to == null) return null;
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

function chaptersLabel(beat: NarrativeBeatInput): string | null {
  const w = beatWindow(beat);
  if (!w) return null;
  return w.from === w.to ? `гл. ${w.from}` : `гл. ${w.from}–${w.to}`;
}

type Placement = "past" | "current" | "near" | "far" | "unplaced";

function placeBeat(beat: NarrativeBeatInput, chapter: number): Placement {
  const w = beatWindow(beat);
  if (!w) return "unplaced";
  if (w.to < chapter) return "past";
  if (w.from <= chapter) return "current";
  return w.from <= chapter + NEAR_WINDOW ? "near" : "far";
}

/**
 * Уровень раскрытия тайны на главу. Если план противоречит сам себе
 * (намёки позже частичного раскрытия и т.п.), выбирается более
 * осторожный уровень, а автору выдаётся предупреждение.
 */
export function secretLevel(
  secret: Pick<NarrativeSecretInput, "hintFromChapter" | "partialRevealChapter" | "plannedRevealChapter">,
  chapter: number
): { level: DisclosureLevel; conflict: boolean; hasPlan: boolean } {
  const { hintFromChapter: hint, partialRevealChapter: partial, plannedRevealChapter: full } = secret;
  const hasPlan = hint != null || partial != null || full != null;
  const hintAt = hint ?? partial ?? full;

  const ordered = [hint, partial, full].filter((v): v is number => v != null);
  const conflict = ordered.some((v, i) => i > 0 && v < (ordered[i - 1] as number));

  const hintReached = hintAt != null && chapter >= hintAt;
  const partialReached = partial != null && chapter >= partial && (!conflict || hintReached);
  const fullReached = full != null && chapter >= full && (!conflict || (hintReached && (partial == null || chapter >= partial)));

  const level: DisclosureLevel = fullReached ? "FULL" : partialReached ? "PARTIAL" : hintReached ? "HINT" : "HIDDEN";
  return { level, conflict, hasPlan };
}

function beatView(beat: NarrativeBeatInput, compact: boolean): BeatView {
  const parts = compact
    ? [clip(beat.description, 160)]
    : [
        clip(beat.description),
        beat.narrativeFunction ? `функция: ${clip(beat.narrativeFunction, 200)}` : "",
        beat.causes ? `причины: ${clip(beat.causes, 250)}` : "",
        beat.consequences ? `последствия: ${clip(beat.consequences, 250)}` : "",
      ];
  return {
    id: beat.id,
    name: beat.name,
    approval: beat.approval,
    authority: beat.approval === "APPROVED" ? "approved" : "preliminary",
    disclosure: beat.disclosure,
    chapters: chaptersLabel(beat),
    details: parts.filter(Boolean).join("; "),
  };
}

const SECTION_TITLES: Record<Placement, string> = {
  past: "ПО ПЛАНУ УЖЕ ДОЛЖНЫ БЫЛИ НАСТУПИТЬ (это план, а не подтверждённые факты: что произошло на самом деле, смотри Canon и предыдущие главы)",
  current: "ОТНОСЯТСЯ К ЭТОЙ ГЛАВЕ",
  near: `ОЖИДАЮТСЯ В БЛИЖАЙШИХ ГЛАВАХ (следующие ${NEAR_WINDOW}; можно подготавливать, нельзя наступать раньше срока)`,
  far: "ОТДАЛЁННОЕ БУДУЩЕЕ (только направление, без подробностей)",
  unplaced: "БЕЗ НОМЕРА ГЛАВЫ (место в книге ещё не выбрано автором; не привязывай к этой главе)",
};

function beatLine(view: BeatView): string {
  const tag = view.authority === "approved" ? "УТВЕРЖДЕНО" : view.approval === "APPROXIMATE" ? "примерно" : "черновая идея";
  const where = view.chapters ? `, ${view.chapters}` : "";
  const disclosure = `, читателю: ${DISCLOSURE_LABELS[view.disclosure]}`;
  return `- [${tag}${where}${disclosure}] ${view.name}${view.details ? `: ${view.details}` : ""}`;
}

const DISCLOSURE_LABELS: Record<BeatDisclosureValue, string> = {
  HIDDEN: "скрыто",
  HINTED: "намёки",
  PARTIAL: "частично",
  REVEALED: "раскрыто",
};

function levelInstruction(level: DisclosureLevel): string {
  switch (level) {
    case "HIDDEN":
      return "не упоминай, не намекай и не объясняй; истина в контекст не передана";
    case "HINT":
      return "допустимы только ненавязчивые, неоднозначные намёки, по которым читатель не сможет восстановить суть; не называй суть, не подтверждай догадки";
    case "PARTIAL":
      return "можно раскрыть часть, оставив ключевое неназванным; полной истины не давай";
    case "FULL":
      return "раскрытие разрешено автором на этой главе; раскрывай только если это нужно по плану главы";
  }
}

export function buildNarrativeContext(input: NarrativeInput): NarrativeContext {
  const { chapterNumber, book } = input;
  const warnings: string[] = [];

  // Вехи другой книги не попадают в контекст этой.
  const beats = book ? input.beats.filter((b) => b.bookId === book.id) : [];
  const ordered = [...beats].sort((a, b) => a.order - b.order);

  const bookFields = book
    ? ([
        ["Предпосылка", book.premise],
        ["Главная арка", book.mainArc],
        ["Предполагаемый финал", book.plannedEnding],
        ["Главные темы", book.themes],
        ["Центральные конфликты", book.centralConflicts],
      ] as const)
        .map(([label, value]) => ({ label, value: clip(value, 1000) }))
        .filter((f) => f.value)
    : [];
  const constraints = clip(book?.authorConstraints, 2000) || null;

  const buckets: Record<Placement, NarrativeBeatInput[]> = { past: [], current: [], near: [], far: [], unplaced: [] };
  for (const beat of ordered) buckets[placeBeat(beat, chapterNumber)].push(beat);

  // Сколько показываем: прошедшие — самые недавние, остальные — по порядку вех.
  const recent = (list: NarrativeBeatInput[]) =>
    [...list].sort((a, b) => (beatWindow(b)?.to ?? 0) - (beatWindow(a)?.to ?? 0)).slice(0, LIMITS.past)
      .sort((a, b) => a.order - b.order);
  const shown: Record<Placement, NarrativeBeatInput[]> = {
    past: recent(buckets.past),
    current: buckets.current.slice(0, LIMITS.current),
    near: buckets.near.slice(0, LIMITS.near),
    far: buckets.far.slice(0, LIMITS.far),
    unplaced: buckets.unplaced.slice(0, LIMITS.unplaced),
  };
  const omitted = Object.fromEntries(
    (Object.keys(buckets) as Placement[]).map((k) => [k, buckets[k].length - shown[k].length])
  ) as Record<Placement, number>;

  const views = Object.fromEntries(
    (Object.keys(shown) as Placement[]).map((k) => [k, shown[k].map((b) => beatView(b, k === "far"))])
  ) as Record<Placement, BeatView[]>;

  // Только подтверждённые автором тайны; предложения ИИ в защиту не входят.
  const secrets = input.secrets
    .filter((s) => s.status === "CANON")
    .sort((a, b) => b.importance - a.importance)
    .slice(0, LIMITS.secrets);

  const secretViews: SecretView[] = [];
  const secretLines: string[] = [];
  for (const secret of secrets) {
    const { level, conflict, hasPlan } = secretLevel(secret, chapterNumber);
    if (conflict) {
      warnings.push(`Тайна «${secret.name}»: сроки раскрытия идут не по порядку (намёки → частично → полностью). Выбран более осторожный уровень: ${LEVEL_LABELS[level]}.`);
    } else if (!hasPlan) {
      warnings.push(`Тайна «${secret.name}»: план раскрытия не задан, она считается скрытой.`);
    }
    if ((secret.revealStatus === "REVEALED" || secret.revealStatus === "RESOLVED") && level !== "FULL") {
      warnings.push(`Тайна «${secret.name}» помечена как раскрытая, но по плану на главе ${chapterNumber} раскрытие ещё не разрешено.`);
    }

    const truthPassed = level !== "HIDDEN" && !!secret.objectiveTruth?.trim();
    const forbidden = level === "FULL" ? null : clip(secret.forbiddenEarly, 400) || null;
    secretViews.push({ id: secret.id, name: secret.name, level, levelLabel: LEVEL_LABELS[level], forbiddenEarly: forbidden, truthPassed });

    const lines = [`- «${secret.name}»: ${LEVEL_LABELS[level].toUpperCase()}: ${levelInstruction(level)}.`];
    if (truthPassed) {
      lines.push(`  Истина мира${level === "FULL" ? "" : " (ТОЛЬКО для планирования, не излагай её в тексте)"}: ${clip(secret.objectiveTruth)}`);
    }
    if (forbidden) lines.push(`  Категорически нельзя раскрывать раньше времени: ${forbidden}`);
    secretLines.push(lines.join("\n"));
  }

  for (const beat of ordered) {
    const w = beatWindow(beat);
    if (beat.disclosure === "REVEALED" && w && w.from > chapterNumber) {
      warnings.push(`Веха «${beat.name}» помечена как раскрытая читателю, но запланирована на ${chaptersLabel(beat)}.`);
    }
  }
  if (ordered.length > 0 && buckets.unplaced.length === ordered.length) {
    warnings.push("У вех нет номеров глав: они показаны как общий замысел и не привязаны к главам.");
  }

  const hasBeats = (Object.keys(shown) as Placement[]).some((k) => shown[k].length > 0);
  const isEmpty = bookFields.length === 0 && !constraints && !hasBeats && secretViews.length === 0;
  if (isEmpty) warnings.push("Сюжетная карта для этой главы пуста: Writer работает как раньше.");

  const preview: NarrativePreview = {
    chapterNumber,
    bookTitle: book?.title ?? null,
    bookFields,
    constraints,
    beats: views,
    omitted,
    secrets: secretViews,
    warnings,
  };

  if (isEmpty) return { promptBlock: "", isEmpty, preview };

  const out: string[] = [
    "",
    "",
    "ДОЛГОСРОЧНЫЙ СЮЖЕТНЫЙ КОНТЕКСТ (знание писателя; это не текст для читателя и не Canon):",
    "Правила:",
    "- Знание о будущем нужно для подготовки сюжета, но не разрешает раскрывать его в тексте этой главы.",
    "- Подготавливай будущие события постепенно: закладывай причины, ненавязчивые намёки, развивай отношения без скачков.",
    "- Веха со статусом УТВЕРЖДЕНО — обязательный авторский ориентир. «Примерно» и «черновая идея» — только возможное направление: не строй на них необратимых событий.",
    "- Запланированная веха ещё не произошла. Не считай её свершившейся и не выдавай за факт.",
    "- Не переноси события будущих вех и будущих книг в эту главу.",
    "- Подтверждённый Canon, утверждённые планы главы и сцен и авторские ограничения выше этих ориентиров. Если ориентир им противоречит, следуй Canon и плану, а в конце ответа добавь строку " +
      `${AUTHOR_NOTES_MARKER} и коротко опиши конфликт.`,
  ];

  if (constraints) out.push("", "ЖЁСТКИЕ АВТОРСКИЕ ОГРАНИЧЕНИЯ (соблюдай всегда):", constraints);

  if (bookFields.length) {
    out.push("", `ЗАМЫСЕЛ КНИГИ${book?.title ? ` «${book.title}»` : ""} (только то, что задал автор):`);
    for (const f of bookFields) out.push(`- ${f.label}: ${f.value}`);
  }

  if (hasBeats) {
    out.push("", `СЮЖЕТНЫЕ ВЕХИ (глава ${chapterNumber}):`);
    for (const key of ["current", "near", "past", "far", "unplaced"] as Placement[]) {
      if (!views[key].length) continue;
      out.push("", `${SECTION_TITLES[key]}:`);
      for (const view of views[key]) out.push(beatLine(view));
      if (omitted[key] > 0) out.push(`- …и ещё ${omitted[key]} (не показаны для экономии контекста)`);
    }
  }

  if (secretLines.length) {
    out.push("", `ТАЙНЫ И ДОПУСТИМОЕ РАСКРЫТИЕ НА ГЛАВЕ ${chapterNumber}:`, ...secretLines);
  }

  return { promptBlock: out.join("\n"), isEmpty, preview };
}
