/**
 * Чистая логика интерфейса Соавтора (без React и без серверных модулей),
 * чтобы её можно было проверить тестами и безопасно импортировать в клиент.
 */
import { COAUTHOR_LIMITS } from "./tiers";

/** Событие окна: редактор главы отправляет выделенный фрагмент в панель Соавтора. */
export const COAUTHOR_ATTACH_EVENT = "coauthor:attach-fragment";

export type AttachDetail = {
  chapterId: string;
  text: string;
  start?: number;
  end?: number;
  /** В редакторе есть несохранённые правки: границы знаков не передаются. */
  unsaved?: boolean;
};

export type FragmentPayload = { chapterId: string; text: string; start?: number; end?: number };

/**
 * Фрагмент для отправки. Если текст в редакторе ещё не сохранён, номера знаков не
 * передаются: сервер сверяет их с сохранённой главой, и они бы не совпали.
 */
export function buildFragmentPayload(
  detail: AttachDetail
): { ok: true; fragment: FragmentPayload } | { ok: false; error: string } {
  const text = detail.text;
  if (!text.trim()) return { ok: false, error: "Сначала выделите фрагмент в тексте главы." };
  if (text.length > COAUTHOR_LIMITS.fragmentChars) {
    return { ok: false, error: `Фрагмент слишком длинный: ${text.length} знаков, можно до ${COAUTHOR_LIMITS.fragmentChars}. Выделите часть поменьше.` };
  }
  const fragment: FragmentPayload = { chapterId: detail.chapterId, text };
  if (!detail.unsaved && detail.start !== undefined && detail.end !== undefined) {
    fragment.start = detail.start;
    fragment.end = detail.end;
  }
  return { ok: true, fragment };
}

/** Идентификатор главы из адреса страницы проекта; null вне страницы главы. */
export function chapterIdFromPath(pathname: string, projectId: string): string | null {
  const prefix = `/projects/${projectId}/chapters/`;
  if (!pathname.startsWith(prefix)) return null;
  const id = pathname.slice(prefix.length).split("/")[0];
  return id ? decodeURIComponent(id) : null;
}

/** Страницы, где панель не нужна (печать/экспорт). */
export function isDockHidden(pathname: string): boolean {
  return /\/export(\/|$)/.test(pathname);
}

export type Segment = { text: string; spoiler: boolean };

const MARKER = /^\s*\[СПОЙЛЕР\]\s*/;

/**
 * Делит ответ на видимые и свёрнутые части.
 *  - абзацы с маркером [СПОЙЛЕР] сворачиваются по отдельности (маркер убирается);
 *  - если сервер пометил ответ как затрагивающий тайны, но маркеров нет
 *    (определено по имени или пересказу тайны), сворачивается весь ответ.
 */
export function splitSpoilers(text: string, containsSpoiler: boolean): Segment[] {
  const paragraphs = text.split(/\n{2,}/);
  const hasMarker = paragraphs.some((p) => MARKER.test(p));
  if (!hasMarker) return containsSpoiler ? [{ text, spoiler: true }] : [{ text, spoiler: false }];
  const out: Segment[] = [];
  for (const p of paragraphs) {
    const spoiler = MARKER.test(p);
    const clean = spoiler ? p.replace(MARKER, "") : p;
    if (!clean.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.spoiler === spoiler) last.text += `\n\n${clean}`;
    else out.push({ text: clean, spoiler });
  }
  return out;
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs === 0 ? 2 : abs < 0.01 ? 4 : abs < 1 ? 3 : 2;
  return `$${value.toFixed(digits)}`;
}

export type BudgetView = { remaining: number; percentUsed: number; level: "ok" | "warn" | "over"; text: string };

/** Остаток месячного бюджета из ответа /api/ai-usage. */
export function budgetView(usedUsd: number, limitUsd: number, warnPercent = 80): BudgetView {
  const remaining = Math.max(0, limitUsd - usedUsd);
  const percentUsed = limitUsd > 0 ? Math.min(100, (usedUsd / limitUsd) * 100) : 100;
  const level = usedUsd >= limitUsd ? "over" : percentUsed >= warnPercent ? "warn" : "ok";
  const text =
    level === "over"
      ? `Месячный лимит ${formatUsd(limitUsd)} исчерпан`
      : `Осталось ${formatUsd(remaining)} из ${formatUsd(limitUsd)} в этом месяце`;
  return { remaining, percentUsed, level, text };
}

/** Понятное сообщение об ошибке отправки. */
export function sendErrorText(status: number, body: { error?: string; code?: string } | null): string {
  if (status === 429 || body?.code === "BUDGET_EXCEEDED") {
    return "Месячный лимит расходов на ИИ исчерпан. Сообщение не отправлено и ничего не списано. Лимит можно изменить на странице «Расходы ИИ».";
  }
  if (status === 413 || body?.code === "INPUT_TOO_LARGE") {
    return "Запрос получился слишком большим. Сократите сообщение или фрагмент и попробуйте ещё раз.";
  }
  if (status === 409 || body?.code === "ARCHIVED") return "Беседа в архиве. Верните её из архива, чтобы продолжить.";
  if (status === 401) return "Нужно войти в систему.";
  if (status === 404) return body?.error ?? "Беседа или глава не найдены.";
  if (status === 502) return body?.error ?? "Соавтор не смог ответить. Сообщение не сохранено, попробуйте ещё раз.";
  return body?.error ?? "Не удалось отправить сообщение.";
}

export type MessageCost = { usd: number | null; assumedUsd: number | null; status: string | null };

export function costText(cost: MessageCost | null | undefined): string {
  if (!cost) return "";
  if (cost.status === "KNOWN" && cost.usd !== null) return formatUsd(cost.usd);
  if (cost.status === "UNKNOWN") return "стоимость неизвестна";
  return "";
}

export const TIER_LABEL = { LUNA: "Luna", TERRA: "Terra" } as const;
export const TERRA_HINT = "Terra сильнее, но примерно в десять раз дороже Luna за сообщение.";
export const SCOPE_LABEL = { CHAPTER: "Глава", TOPIC: "Тема", PROJECT: "Весь проект" } as const;

// ───────────────────────── потоковый ответ ─────────────────────────

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; author: unknown; reply: unknown; tier?: string; mock?: boolean }
  | { type: "error"; status?: number; code?: string; error: string };

/**
 * Разбирает накопленный буфер NDJSON. Неполная последняя строка остаётся в rest
 * и достраивается следующим куском: границы чтения не совпадают с границами строк.
 */
export function parseNdjson(buffer: string): { events: StreamEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: StreamEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as StreamEvent;
      if (event && typeof event === "object" && "type" in event) events.push(event);
    } catch {
      // повреждённая строка не должна ломать остальной поток
    }
  }
  return { events, rest };
}

/** Что сказать автору после обрыва потока, который он сам остановил. */
export const STOPPED_NOTE =
  "Остановлено. Этот ответ не сохранён. Часть запроса могла быть оплачена: она учтена в расходах как резерв, точная сумма неизвестна.";

// ───────────────────────── длинные беседы ─────────────────────────

/** Когда предложить сжатие: беседа длинная и есть что сжимать за пределами окна. */
export function shouldOfferSummary(messageCount: number, hasSummary: boolean, afterSummaryCount?: number): boolean {
  const live = hasSummary ? (afterSummaryCount ?? messageCount) : messageCount;
  return live >= 16;
}

// ───────────────────────── сценарный критик ─────────────────────────

export const CRITIC_DEFAULT_TEXT = "Проведи критический разбор этой главы.";

export const SEVERITY_COLOR = {
  CRITICAL: { bg: "#fdecec", border: "#d9534f", text: "#8a1c1c" },
  MAJOR: { bg: "#fff4e0", border: "#e09a1a", text: "#7a4a00" },
  MINOR: { bg: "#f3f4f6", border: "#bbb", text: "#444" },
} as const;

export type ReportView = {
  verdict: string;
  problems: {
    severity: keyof typeof SEVERITY_COLOR;
    category: string;
    evidence: string;
    problem: string;
    whyItMatters: string;
    recommendations: string[];
  }[];
  strengths: string[];
  questionsForAuthor: string[];
};

/** Проверка формы отчёта из базы: интерфейс не должен падать на повреждённых данных. */
export function asReport(value: unknown): ReportView | null {
  const v = value as Partial<ReportView> | null;
  if (!v || typeof v !== "object" || typeof v.verdict !== "string" || !Array.isArray(v.problems)) return null;
  const problems = v.problems.filter(
    (p) => p && typeof p.problem === "string" && typeof p.severity === "string" && p.severity in SEVERITY_COLOR && Array.isArray(p.recommendations)
  );
  return {
    verdict: v.verdict,
    problems,
    strengths: Array.isArray(v.strengths) ? v.strengths.filter((s) => typeof s === "string") : [],
    questionsForAuthor: Array.isArray(v.questionsForAuthor) ? v.questionsForAuthor.filter((s) => typeof s === "string") : [],
  };
}

export const MODE_LABEL = { DISCUSSION: "Обсуждение", CRITIC: "Сценарный критик" } as const;
