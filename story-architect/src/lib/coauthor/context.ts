/**
 * Coauthor Context Builder.
 *
 * Чистая сборка (assembleCoauthorContext) отделена от загрузки данных
 * (loadCoauthorContext). Только чтение: ничего не пишет в Canon и в базу.
 *
 * Каждое сведение несёт статус: УТВЕРЖДЕНО / РАБОЧАЯ ВЕРСИЯ / НЕ РЕШЕНО /
 * ПРЕДЛОЖЕНИЕ ИИ. Раздел «тайны» передаёт объективную истину как знание автора
 * и отдельно показывает, что разрешено читателю и что знают персонажи.
 * Если лимит знаков превышен, сначала урезаются разделы с низким приоритетом.
 */
import type { PrismaClient } from "@prisma/client";
import { secretLevel, LEVEL_LABELS, type DisclosureLevel, type NarrativeContext } from "../plotMap/narrativeContext";
import { loadNarrativeContext } from "../plotMap/loadNarrative";
import { buildStoryStateWithStats } from "../context/storyState";
import { COAUTHOR_LIMITS } from "./tiers";
import type { SpoilerSecret } from "./spoiler";

export type SectionKey =
  | "project"
  | "canon"
  | "state"
  | "chapter"
  | "plan"
  | "secrets"
  | "arcs"
  | "summaries"
  | "open"
  | "proposals";

export type SecretInput = {
  name: string;
  objectiveTruth: string | null;
  forbiddenEarly: string | null;
  hintFromChapter: number | null;
  partialRevealChapter: number | null;
  plannedRevealChapter: number | null;
  knowers: { name: string; sinceChapter: number | null; partial: boolean; knows: boolean }[];
};

export type CoauthorContextInput = {
  project: { name: string; premise: string | null; genre: string | null; tone: string | null; projectRules: string | null };
  /** Номер главы, относительно которой собран контекст; null, если глав нет. */
  chapterNumber: number | null;
  /** true: обсуждается существующая глава; false: «следующая» после последней. */
  anchoredToChapter: boolean;
  canonFacts: { statement: string; negation: boolean; importance: number }[];
  storyState: string;
  narrative: NarrativeContext | null;
  secrets: SecretInput[];
  arcs: { character: string; name: string; status: string; start: string; current: string; target: string }[];
  summaries: { label: string; text: string }[];
  openQuestions: { question: string; answer: string | null; resolved: boolean }[];
  aiProposals: { entityType: string; op: string; reason: string | null }[];
  chapter: { number: number; title: string | null; authorIdea: string | null; intent: string | null; draft: string | null } | null;
};

export type ContextResult = {
  text: string;
  chars: number;
  sections: Partial<Record<SectionKey, number>>;
  truncated: SectionKey[];
  /** Секреты, истина которых передана модели (для признака спойлера). */
  spoilerSecrets: SpoilerSecret[];
};

const clip = (text: string | null | undefined, max: number): string => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
};

/** Как clip, но сохраняет абзацы: критик читает главу с её разбивкой на реплики и абзацы. */
const clipMultiline = (text: string | null | undefined, max: number): string => {
  const t = (text ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
};

const take = (lines: string[], max: number): string => {
  const out: string[] = [];
  let len = 0;
  for (const line of lines) {
    if (len + line.length + 1 > max) {
      out.push("- …часть записей не показана (лимит контекста)");
      break;
    }
    out.push(line);
    len += line.length + 1;
  }
  return out.join("\n");
};

/** Порядок = приоритет (первые урезаются последними). */
const ORDER: { key: SectionKey; title: string; max: number }[] = [
  { key: "project", title: "ПРОЕКТ", max: 3_000 },
  { key: "canon", title: "УТВЕРЖДЁННЫЙ CANON (статус: УТВЕРЖДЕНО)", max: 8_000 },
  { key: "chapter", title: "ОБСУЖДАЕМАЯ ГЛАВА", max: 7_000 },
  { key: "plan", title: "СЮЖЕТНЫЙ ЗАМЫСЕЛ И ВЕХИ", max: 7_000 },
  { key: "secrets", title: "ТАЙНЫ, ЗНАНИЯ ПЕРСОНАЖЕЙ И ДОПУСТИМОЕ РАСКРЫТИЕ (СПОЙЛЕРЫ ДЛЯ АВТОРА)", max: 6_000 },
  { key: "state", title: "СОСТОЯНИЕ ИСТОРИИ (Canon: персонажи, отношения)", max: 6_000 },
  { key: "arcs", title: "АРКИ ПЕРСОНАЖЕЙ", max: 3_000 },
  { key: "summaries", title: "РЕЗЮМЕ ПРЕДЫДУЩИХ ГЛАВ", max: 4_000 },
  { key: "open", title: "НЕ РЕШЕНО (открытые вопросы автора)", max: 2_000 },
  { key: "proposals", title: "ПРЕДЛОЖЕНИЯ ИИ, ЖДУЩИЕ РЕШЕНИЯ АВТОРА (статус: ПРЕДЛОЖЕНИЕ ИИ, не факт)", max: 1_500 },
];

const BEAT_TAG: Record<string, string> = { approved: "УТВЕРЖДЕНО", approx: "РАБОЧАЯ ВЕРСИЯ (примерно)", idea: "РАБОЧАЯ ВЕРСИЯ (черновая идея)" };

function planSection(n: NarrativeContext | null): string {
  if (!n || n.isEmpty) return "";
  const p = n.preview;
  const out: string[] = [];
  if (p.constraints) out.push(`Жёсткие авторские ограничения: ${p.constraints}`);
  for (const f of p.bookFields) out.push(`${f.label}: ${f.value}`);
  const titles: Record<string, string> = {
    current: "относятся к этой главе",
    near: "ожидаются в ближайших главах",
    past: "по плану уже должны были наступить (это план, не факт)",
    far: "отдалённое будущее",
    unplaced: "без номера главы",
  };
  for (const key of ["current", "near", "past", "far", "unplaced"] as const) {
    const list = p.beats[key];
    if (!list.length) continue;
    out.push(`Вехи, ${titles[key]}:`);
    for (const b of list) {
      const tag = b.authority === "approved" ? BEAT_TAG.approved : b.approval === "APPROXIMATE" ? BEAT_TAG.approx : BEAT_TAG.idea;
      out.push(`- [${tag}] «${b.name}»${b.chapters ? `, ${b.chapters}` : ""}${b.details ? `: ${b.details}` : ""}`);
    }
    if (p.omitted[key] > 0) out.push(`- …и ещё ${p.omitted[key]} (не показаны)`);
  }
  return out.join("\n");
}

function secretsSection(input: CoauthorContextInput): { text: string; included: SpoilerSecret[] } {
  const chapter = input.chapterNumber ?? 1;
  const included: SpoilerSecret[] = [];
  const blocks: string[] = [];
  for (const s of input.secrets) {
    const { level } = secretLevel(s, chapter);
    const reader = LEVEL_LABELS[level as DisclosureLevel];
    const lines = [`- «${s.name}» — читателю на главе ${chapter}: ${reader}.`];
    if (s.objectiveTruth?.trim()) {
      lines.push(`  Истина мира (знание автора, СПОЙЛЕР): ${clip(s.objectiveTruth, 500)}`);
      included.push({ name: s.name, objectiveTruth: s.objectiveTruth });
    }
    if (level !== "FULL" && s.forbiddenEarly) lines.push(`  Нельзя раскрывать раньше времени: ${clip(s.forbiddenEarly, 300)}`);
    const knowing = s.knowers.filter((k) => k.knows);
    if (knowing.length) {
      lines.push(
        `  Знают персонажи: ${knowing
          .map((k) => `${k.name}${k.partial ? " (частично)" : ""}${k.sinceChapter != null ? ` с гл. ${k.sinceChapter}` : ""}`)
          .join(", ")}`
      );
    } else {
      lines.push("  Персонажи этой тайны не знают (или данных о знании нет).");
    }
    blocks.push(lines.join("\n"));
  }
  return { text: blocks.join("\n"), included };
}

export function assembleCoauthorContext(
  input: CoauthorContextInput,
  maxChars: number = COAUTHOR_LIMITS.contextChars,
  opts: { draftChars?: number } = {}
): ContextResult {
  const body: Partial<Record<SectionKey, string>> = {};

  const proj = [
    `Название: ${input.project.name}`,
    input.project.genre && `Жанр: ${input.project.genre}`,
    input.project.tone && `Тон: ${input.project.tone}`,
    input.project.premise && `Предпосылка: ${clip(input.project.premise, 800)}`,
    input.project.projectRules && `Правила проекта: ${clip(input.project.projectRules, 1000)}`,
    input.chapterNumber != null
      ? input.anchoredToChapter
        ? `Контекст собран относительно главы ${input.chapterNumber}.`
        : `Глава для обсуждения не выбрана: контекст собран на момент после последней написанной главы (следующая — ${input.chapterNumber}).`
      : "Глав в проекте пока нет.",
  ].filter(Boolean) as string[];
  body.project = proj.join("\n");

  const facts = [...input.canonFacts].sort((a, b) => b.importance - a.importance);
  body.canon = take(
    facts.map((f) => `- ${f.negation ? "НИКОГДА: " : ""}${clip(f.statement, 300)}`),
    ORDER[1]!.max
  );

  body.state = clip(input.storyState, ORDER[5]!.max);

  if (input.chapter) {
    const c = input.chapter;
    const lines = [`Глава ${c.number}${c.title ? ` «${c.title}»` : ""}.`];
    if (c.authorIdea) lines.push(`Идея автора: ${clip(c.authorIdea, 800)}`);
    if (c.intent) lines.push(`Авторский замысел: ${clip(c.intent, 800)}`);
    if (c.draft) lines.push(`Черновик (статус: РАБОЧАЯ ВЕРСИЯ${opts.draftChars ? "" : ", начало"}): ${clipMultiline(c.draft, opts.draftChars ?? 4_000)}`);
    body.chapter = lines.join("\n");
  }

  body.plan = planSection(input.narrative);

  const sec = secretsSection(input);
  body.secrets = take(sec.text.split("\n"), ORDER[4]!.max);

  body.arcs = take(
    input.arcs.map((a) => {
      const tag = a.status === "CANON" ? "УТВЕРЖДЕНО" : a.status === "PROPOSAL" ? "ПРЕДЛОЖЕНИЕ ИИ" : "РАБОЧАЯ ВЕРСИЯ";
      return `- [${tag}] ${a.character}, «${a.name}»: от ${clip(a.start, 150)} → сейчас ${clip(a.current, 150) || "не задано"} → цель ${clip(a.target, 150)}`;
    }),
    ORDER[6]!.max
  );

  body.summaries = take(input.summaries.map((s) => `- ${s.label}: ${clip(s.text, 500)}`), ORDER[7]!.max);

  body.open = take(
    input.openQuestions.map((q) => `- ${clip(q.question, 250)}${q.answer ? ` → ответ автора: ${clip(q.answer, 250)}` : " (ответа нет)"}`),
    ORDER[8]!.max
  );

  body.proposals = take(
    input.aiProposals.map((p) => `- ${p.entityType} / ${p.op}${p.reason ? `: ${clip(p.reason, 200)}` : ""}`),
    ORDER[9]!.max
  );

  // Сборка с вытеснением: сначала урезаем самые низкоприоритетные.
  const present = ORDER.filter((s) => (body[s.key] ?? "").trim().length > 0);
  const sizes: Partial<Record<SectionKey, number>> = {};
  const truncated: SectionKey[] = [];
  const overhead = (s: { title: string }) => s.title.length + 8;
  let total = present.reduce((n, s) => n + (body[s.key] as string).length + overhead(s), 0);
  for (let i = present.length - 1; i >= 0; i--) {
    const excess = total - maxChars;
    if (excess <= 0) break;
    const s = present[i]!;
    const text = body[s.key] as string;
    const keep = text.length - excess - 60; // запас под пометку об урезании
    truncated.push(s.key);
    if (keep < 200) {
      total -= text.length + overhead(s);
      body[s.key] = "";
    } else {
      const cut = `${text.slice(0, keep).trimEnd()}\n…(раздел урезан из-за лимита контекста)`;
      total -= text.length - cut.length;
      body[s.key] = cut;
    }
  }

  const parts: string[] = [];
  for (const s of present) {
    const text = body[s.key] ?? "";
    if (!text) continue;
    sizes[s.key] = text.length;
    parts.push(`== ${s.title} ==\n${text}`);
  }
  const text = parts.join("\n\n");
  const secretsKept = (body.secrets ?? "").length > 0;
  return { text, chars: text.length, sections: sizes, truncated, spoilerSecrets: secretsKept ? sec.included : [] };
}

// ───────────────────────── загрузка данных ─────────────────────────

export type ChapterRef = { id: string; number: number; title: string | null; bookId: string; bookNumber: number };

const json = (v: unknown): string => {
  if (v == null) return "";
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s === "{}" || s === "null" ? "" : s;
  } catch {
    return "";
  }
};

/** Собирает входные данные из базы. Только чтение. */
export async function loadCoauthorContext(
  db: PrismaClient,
  args: { projectId: string; chapterId: string | null }
): Promise<{ input: CoauthorContextInput; chapterRef: ChapterRef | null }> {
  const { projectId } = args;
  const project = await db.project.findFirst({
    where: { id: projectId },
    select: { name: true, premise: true, genre: true, tone: true, projectRules: true },
  });
  if (!project) throw new Error("Проект не найден");

  let chapterRef: ChapterRef | null = null;
  let chapterRow: { authorIdea: string | null; authorIntent: unknown; draftText: string | null; finalText: string | null } | null = null;
  let anchored = false;

  if (args.chapterId) {
    const c = await db.chapter.findFirst({
      where: { id: args.chapterId, book: { projectId } },
      select: {
        id: true, number: true, title: true, bookId: true, authorIdea: true, authorIntent: true, draftText: true, finalText: true,
        book: { select: { number: true } },
      },
    });
    if (c) {
      chapterRef = { id: c.id, number: c.number, title: c.title, bookId: c.bookId, bookNumber: c.book.number };
      chapterRow = c;
      anchored = true;
    }
  }
  if (!chapterRef) {
    const last = await db.chapter.findFirst({
      where: { book: { projectId } },
      orderBy: [{ book: { number: "desc" } }, { number: "desc" }],
      select: { id: true, number: true, bookId: true, book: { select: { number: true } } },
    });
    if (last) chapterRef = { id: "", number: last.number + 1, title: null, bookId: last.bookId, bookNumber: last.book.number };
  }

  const n = chapterRef?.number ?? null;
  const ref = chapterRef ? { projectId, bookId: chapterRef.bookId, bookNumber: chapterRef.bookNumber, chapterNumber: chapterRef.number } : null;

  const [facts, secrets, arcs, summaries, questions, proposals, narrative, state] = await Promise.all([
    db.canonFact.findMany({
      where: { projectId, status: "CANON" },
      orderBy: [{ importance: "desc" }, { createdAt: "asc" }],
      take: 120,
      select: { statement: true, negation: true, importance: true, validFromChapter: true, validToChapter: true },
    }),
    db.secret.findMany({
      where: { projectId, status: "CANON" },
      orderBy: [{ importance: "desc" }, { createdAt: "asc" }],
      take: 20,
      select: {
        name: true, objectiveTruth: true, forbiddenEarly: true, hintFromChapter: true, partialRevealChapter: true, plannedRevealChapter: true,
        knowledge: { where: { status: "CANON", holderType: "CHARACTER" }, select: { knows: true, partial: true, sinceChapter: true, character: { select: { name: true } } } },
      },
    }),
    db.characterArc.findMany({
      where: { character: { projectId, status: "CANON" }, status: { in: ["CANON", "DRAFT", "PROPOSAL"] } },
      take: 20,
      select: { name: true, status: true, startState: true, currentState: true, targetState: true, character: { select: { name: true } } },
    }),
    ref
      ? db.chapterSummary.findMany({
          where: { chapter: { book: { projectId }, OR: [{ bookId: ref.bookId, number: { lt: ref.chapterNumber } }, { book: { number: { lt: ref.bookNumber } } }] } },
          orderBy: { chapter: { number: "desc" } },
          take: 8,
          select: { shortSummary: true, chapter: { select: { number: true, title: true } } },
        })
      : Promise.resolve([]),
    db.openQuestion.findMany({
      where: { projectId, status: { in: ["UNKNOWN", "DRAFT"] } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { question: true, answer: true, status: true },
    }),
    db.proposal.findMany({ where: { projectId, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 10, select: { entityType: true, op: true, reason: true } }),
    ref ? loadNarrativeContext({ bookId: ref.bookId, number: ref.chapterNumber, projectId }) : Promise.resolve(null),
    ref ? buildStoryStateWithStats(ref, { maxChars: 6_000 }) : Promise.resolve(null),
  ]);

  const inWindow = (f: { validFromChapter: number | null; validToChapter: number | null }) =>
    n == null || ((f.validFromChapter == null || f.validFromChapter <= n) && (f.validToChapter == null || f.validToChapter >= n));

  const intent = chapterRow ? json(chapterRow.authorIntent) : "";
  return {
    chapterRef,
    input: {
      project,
      chapterNumber: n,
      anchoredToChapter: anchored,
      canonFacts: facts.filter(inWindow).map((f) => ({ statement: f.statement, negation: f.negation, importance: f.importance })),
      storyState: state?.text ?? "",
      narrative,
      secrets: secrets.map((s) => ({
        name: s.name,
        objectiveTruth: s.objectiveTruth,
        forbiddenEarly: s.forbiddenEarly,
        hintFromChapter: s.hintFromChapter,
        partialRevealChapter: s.partialRevealChapter,
        plannedRevealChapter: s.plannedRevealChapter,
        knowers: s.knowledge.map((k) => ({ name: k.character?.name ?? "?", sinceChapter: k.sinceChapter, partial: k.partial, knows: k.knows })),
      })),
      arcs: arcs.map((a) => ({
        character: a.character.name,
        name: a.name,
        status: a.status,
        start: json(a.startState),
        current: json(a.currentState),
        target: json(a.targetState),
      })),
      summaries: [...summaries]
        .reverse()
        .map((s) => ({ label: `гл. ${s.chapter.number}${s.chapter.title ? ` «${s.chapter.title}»` : ""}`, text: s.shortSummary })),
      openQuestions: questions.map((q) => ({ question: q.question, answer: q.answer, resolved: false })),
      aiProposals: proposals.map((p) => ({ entityType: p.entityType, op: String(p.op), reason: p.reason })),
      chapter:
        chapterRef && chapterRow
          ? { number: chapterRef.number, title: chapterRef.title, authorIdea: chapterRow.authorIdea, intent: intent || null, draft: chapterRow.draftText ?? chapterRow.finalText }
          : null,
    },
  };
}
