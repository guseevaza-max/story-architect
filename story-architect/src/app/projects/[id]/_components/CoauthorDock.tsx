"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CATEGORY_LABEL, SEVERITY_LABEL } from "@/lib/coauthor/critic";
import {
  COAUTHOR_ATTACH_EVENT,
  CRITIC_DEFAULT_TEXT,
  MODE_LABEL,
  SCOPE_LABEL,
  SEVERITY_COLOR,
  STOPPED_NOTE,
  TERRA_HINT,
  TIER_LABEL,
  budgetView,
  buildFragmentPayload,
  chapterIdFromPath,
  costText,
  formatUsd,
  isDockHidden,
  asReport,
  parseNdjson,
  sendErrorText,
  shouldOfferSummary,
  splitSpoilers,
  type AttachDetail,
  type BudgetView,
  type FragmentPayload,
  type MessageCost,
  type ReportView,
} from "@/lib/coauthor/ui";

/**
 * Панель Соавтора: выдвижная, доступна со всех страниц проекта.
 * Соавтор только обсуждает. Он ничего не записывает в Canon, Story Bible,
 * сюжетную карту и главы; идеи остаются предложениями, пока автор их не утвердит.
 */

type Tier = "LUNA" | "TERRA";
type Scope = "CHAPTER" | "TOPIC" | "PROJECT";
type Mode = "DISCUSSION" | "CRITIC";
type Thread = {
  id: string;
  title: string;
  scope: Scope;
  mode: Mode;
  chapterId: string | null;
  defaultTier: Tier;
  archivedAt: string | null;
  updatedAt: string;
  summary?: string | null;
  summaryUpToAt?: string | null;
};
type Message = {
  id: string;
  role: "AUTHOR" | "COAUTHOR";
  text: string;
  tier: Tier | null;
  model: string | null;
  containsSpoiler: boolean;
  fragmentText: string | null;
  createdAt: string;
  cost: MessageCost | null;
  report?: unknown;
};
type View = "list" | "new" | "thread";

const btn: React.CSSProperties = { padding: "6px 10px", border: "1px solid #ccc", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 };
const primary: React.CSSProperties = { ...btn, border: "none", background: "#111", color: "#fff" };
const field: React.CSSProperties = { width: "100%", padding: 8, boxSizing: "border-box", border: "1px solid #ccc", borderRadius: 8, fontSize: 14, fontFamily: "inherit" };

export default function CoauthorDock({ projectId }: { projectId: string }) {
  const pathname = usePathname() ?? "";
  const pathChapterId = chapterIdFromPath(pathname, projectId);
  const hidden = isDockHidden(pathname);
  const base = `/api/projects/${projectId}/coauthor/threads`;

  const [available, setAvailable] = useState(true);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [archivedMode, setArchivedMode] = useState(false);
  const [current, setCurrent] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [budget, setBudget] = useState<BudgetView | null>(null);
  const [fragment, setFragment] = useState<FragmentPayload | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState<Tier | null>(null);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [form, setForm] = useState<{ title: string; scope: Scope; chapterId: string | null; tier: Tier; mode: Mode }>({ title: "", scope: "TOPIC", chapterId: null, tier: "LUNA", mode: "DISCUSSION" });
  const [streamText, setStreamText] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadBudget = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-usage");
      if (!res.ok) return;
      const json = await res.json();
      setBudget(budgetView(Number(json.budgetUsedUsd), Number(json.limitUsd), Number(json.warnPercent) || 80));
    } catch {
      // остаток бюджета вспомогателен: без него панель работает
    }
  }, []);

  const loadThreads = useCallback(
    async (archived: boolean) => {
      try {
        const res = await fetch(`${base}${archived ? "?archived=true" : ""}`);
        if (res.status === 401 || res.status === 404) return setAvailable(false);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Ошибка");
        setThreads(json.threads);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [base]
  );

  const openThread = useCallback(
    async (id: string) => {
      setError("");
      try {
        const res = await fetch(`${base}/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Ошибка");
        setCurrent(json.thread);
        setMessages(json.messages);
        setView("thread");
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [base]
  );

  // Открытие панели: список бесед и остаток бюджета.
  useEffect(() => {
    if (!open) return;
    void loadThreads(archivedMode);
    void loadBudget();
  }, [open, archivedMode, loadThreads, loadBudget]);

  // Фрагмент из редактора главы.
  useEffect(() => {
    const onAttach = (event: Event) => {
      const detail = (event as CustomEvent<AttachDetail>).detail;
      const built = buildFragmentPayload(detail);
      setOpen(true);
      if (!built.ok) return setError(built.error);
      setError("");
      setFragment(built.fragment);
      if (view !== "thread") {
        setForm((f) => ({ ...f, scope: "CHAPTER", chapterId: built.fragment.chapterId }));
        setView("new");
      }
    };
    window.addEventListener(COAUTHOR_ATTACH_EVENT, onAttach);
    return () => window.removeEventListener(COAUTHOR_ATTACH_EVENT, onAttach);
  }, [view]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending, streamText]);

  if (hidden || !available) return null;

  async function createThread() {
    setError("");
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(form.title.trim() ? { title: form.title.trim() } : {}),
          scope: form.scope,
          ...(form.scope === "CHAPTER" && form.chapterId ? { chapterId: form.chapterId } : {}),
          defaultTier: form.tier,
          mode: form.mode,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось создать беседу");
      setForm({ title: "", scope: "TOPIC", chapterId: null, tier: "LUNA", mode: "DISCUSSION" });
      await openThread(json.thread.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Ответ целиком (режим критика). */
  async function sendWhole(tier: Tier, body: string): Promise<boolean> {
    if (!current) return false;
    const res = await fetch(`${base}/${current.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body, tier, ...(fragment ? { fragment } : {}) }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(sendErrorText(res.status, json));
      return false;
    }
    return true;
  }

  /** Потоковый ответ обсуждения: слова появляются по мере генерации. */
  async function sendStreaming(tier: Tier, body: string): Promise<boolean> {
    if (!current) return false;
    const controller = new AbortController();
    abortRef.current = controller;
    const res = await fetch(`${base}/${current.id}/messages/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body, tier, ...(fragment ? { fragment } : {}) }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const json = await res.json().catch(() => null);
      setError(sendErrorText(res.status, json));
      return false;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseNdjson(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (event.type === "delta") setStreamText((t) => t + event.text);
          else if (event.type === "done") finished = true;
          else if (event.type === "error") setError(sendErrorText(event.status ?? 500, { error: event.error, code: event.code }));
        }
      }
    } catch (e) {
      setError((e as Error).name === "AbortError" ? STOPPED_NOTE : "Соединение прервано. Ответ не сохранён, текст сообщения остался в поле ввода.");
    }
    return finished;
  }

  async function send(tier: Tier) {
    if (!current || sending) return;
    const critic = current.mode === "CRITIC";
    const body = critic ? text.trim() || CRITIC_DEFAULT_TEXT : text.trim();
    if (!body) return;
    setSending(tier);
    setError("");
    setStreamText("");
    try {
      const ok = critic ? await sendWhole(tier, body) : await sendStreaming(tier, body);
      if (ok) {
        setText("");
        setFragment(null);
        setStreamText("");
        await openThread(current.id);
      }
      void loadBudget();
    } catch {
      setError("Ошибка соединения с сервером. Сообщение не отправлено.");
    } finally {
      abortRef.current = null;
      setStreamText("");
      setSending(null);
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  async function summarize() {
    if (!current || summarizing) return;
    if (!window.confirm("Сжать раннюю часть беседы в краткий пересказ? Это один небольшой платный запрос на Luna (обычно доли цента). Сообщения не удаляются.")) return;
    setSummarizing(true);
    setError("");
    try {
      const res = await fetch(`${base}/${current.id}/summarize`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(sendErrorText(res.status, json));
        return;
      }
      setCurrent(json.thread);
      setShowSummary(true);
      void loadBudget();
    } catch {
      setError("Ошибка соединения с сервером.");
    } finally {
      setSummarizing(false);
    }
  }

  async function patchThread(id: string, body: Record<string, unknown>) {
    setError("");
    try {
      const res = await fetch(`${base}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось изменить беседу");
      setRenaming(null);
      if (current?.id === id) setCurrent(json.thread);
      await loadThreads(archivedMode);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeThread(thread: Thread) {
    if (!window.confirm(`Удалить беседу «${thread.title}» вместе со всеми сообщениями? Это нельзя отменить.`)) return;
    setError("");
    try {
      const res = await fetch(`${base}/${thread.id}?confirm=true`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось удалить беседу");
      if (current?.id === thread.id) {
        setCurrent(null);
        setMessages([]);
      }
      setView("list");
      await loadThreads(archivedMode);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const scopeOptions: Scope[] = pathChapterId || form.chapterId ? ["CHAPTER", "TOPIC", "PROJECT"] : ["TOPIC", "PROJECT"];
  const chapterForNew = form.chapterId ?? pathChapterId;
  const budgetColor = budget?.level === "over" ? "#b00020" : budget?.level === "warn" ? "#a15c00" : "#555";

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Открыть Соавтора"
          style={{ position: "fixed", right: 20, bottom: 20, zIndex: 50, padding: "12px 18px", borderRadius: 999, border: "none", background: "#111", color: "#fff", cursor: "pointer", fontSize: 15, boxShadow: "0 4px 14px rgba(0,0,0,.25)" }}
        >
          💬 Соавтор
        </button>
      )}

      {open && (
        <aside
          aria-label="Соавтор"
          style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 100vw)", zIndex: 60, background: "#fff", borderLeft: "1px solid #ddd", boxShadow: "-4px 0 18px rgba(0,0,0,.12)", display: "flex", flexDirection: "column", fontFamily: "Arial, sans-serif" }}
        >
          <header style={{ padding: "12px 14px", borderBottom: "1px solid #eee" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {view !== "list" && (
                <button type="button" style={btn} onClick={() => { setView("list"); setError(""); void loadThreads(archivedMode); }}>
                  ← Беседы
                </button>
              )}
              <strong style={{ flex: 1, fontSize: 16 }}>💬 Соавтор</strong>
              <button type="button" style={btn} onClick={() => setOpen(false)} aria-label="Закрыть">✕</button>
            </div>
            {budget && (
              <div style={{ marginTop: 8, fontSize: 12, color: budgetColor }}>
                {budget.text}
                <div style={{ height: 4, background: "#eee", borderRadius: 2, marginTop: 4 }}>
                  <div style={{ width: `${budget.percentUsed}%`, height: 4, borderRadius: 2, background: budget.level === "over" ? "#b00020" : budget.level === "warn" ? "#d98200" : "#4a8" }} />
                </div>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 11, color: "#777", lineHeight: 1.4 }}>
              Соавтор обсуждает и предлагает. Ничего не записывается в Canon, Story Bible, сюжетную карту и главы без вашего решения.
            </div>
          </header>

          {error && (
            <div role="alert" style={{ margin: "10px 14px 0", padding: 10, borderRadius: 8, background: "#fdecec", color: "#8a1c1c", fontSize: 13, lineHeight: 1.45 }}>
              {error}
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            {view === "list" && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <button type="button" style={primary} onClick={() => { setForm({ title: "", scope: pathChapterId ? "CHAPTER" : "TOPIC", chapterId: pathChapterId, tier: "LUNA", mode: "DISCUSSION" }); setView("new"); }}>
                    + Новая беседа
                  </button>
                  <button type="button" style={btn} onClick={() => setArchivedMode((v) => !v)}>
                    {archivedMode ? "Показать активные" : "Архив"}
                  </button>
                </div>
                {threads.length === 0 && <p style={{ color: "#666", fontSize: 14 }}>{archivedMode ? "В архиве пусто." : "Бесед пока нет. Начните новую."}</p>}
                {threads.map((t) => (
                  <div key={t.id} style={{ border: "1px solid #e3e3e3", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    {renaming === t.id ? (
                      <RenameRow initial={t.title} onSave={(title) => patchThread(t.id, { title })} onCancel={() => setRenaming(null)} />
                    ) : (
                      <button type="button" onClick={() => openThread(t.id)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                        <div style={{ fontSize: 12, color: "#777" }}>
                          {t.mode === "CRITIC" ? "Критик · " : ""}{SCOPE_LABEL[t.scope]} · {TIER_LABEL[t.defaultTier]} · {new Date(t.updatedAt).toLocaleString("ru-RU")}
                        </div>
                      </button>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button type="button" style={btn} onClick={() => setRenaming(t.id)}>Переименовать</button>
                      <button type="button" style={btn} onClick={() => patchThread(t.id, { archived: !t.archivedAt })}>{t.archivedAt ? "Вернуть" : "В архив"}</button>
                      <button type="button" style={{ ...btn, color: "#b00020" }} onClick={() => removeThread(t)}>Удалить</button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {view === "new" && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Название (необязательно)</label>
                <input style={{ ...field, margin: "4px 0 12px" }} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Например: мотивация Анны" />
                <label style={{ fontSize: 13, fontWeight: 600 }}>Режим</label>
                <select
                  style={{ ...field, margin: "4px 0 4px" }}
                  value={form.mode}
                  onChange={(e) => {
                    const mode = e.target.value as Mode;
                    setForm({ ...form, mode, scope: mode === "CRITIC" ? "CHAPTER" : form.scope, chapterId: mode === "CRITIC" ? chapterForNew : form.chapterId });
                  }}
                >
                  <option value="DISCUSSION">Обсуждение</option>
                  <option value="CRITIC">Сценарный критик (строгий разбор главы)</option>
                </select>
                {form.mode === "CRITIC" && (
                  <div style={{ fontSize: 12, color: chapterForNew ? "#777" : "#b00020", marginBottom: 8 }}>
                    {chapterForNew
                      ? "Критик прочитает главу целиком и вернёт отчёт с проблемами и рекомендациями. Это дороже обычного сообщения."
                      : "Откройте страницу главы, чтобы создать беседу критика."}
                  </div>
                )}
                <label style={{ fontSize: 13, fontWeight: 600 }}>О чём беседа</label>
                <select
                  style={{ ...field, margin: "4px 0 12px" }}
                  value={form.scope}
                  disabled={form.mode === "CRITIC"}
                  onChange={(e) => {
                    const scope = e.target.value as Scope;
                    setForm({ ...form, scope, chapterId: scope === "CHAPTER" ? chapterForNew : form.chapterId });
                  }}
                >
                  {scopeOptions.map((s) => (
                    <option key={s} value={s}>{s === "CHAPTER" ? "Глава (открытая сейчас)" : SCOPE_LABEL[s]}</option>
                  ))}
                </select>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Модель по умолчанию</label>
                <select style={{ ...field, margin: "4px 0 4px" }} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as Tier })}>
                  <option value="LUNA">Luna (экономная)</option>
                  <option value="TERRA">Terra (дороже)</option>
                </select>
                <div style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>{TERRA_HINT} Для отдельного сообщения можно выбрать Terra и при Luna по умолчанию.</div>
                {fragment && <FragmentChip fragment={fragment} onRemove={() => setFragment(null)} />}
                <button type="button" style={primary} onClick={createThread} disabled={(form.scope === "CHAPTER" || form.mode === "CRITIC") && !chapterForNew}>
                  Создать беседу
                </button>
              </div>
            )}

            {view === "thread" && current && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  {renaming === current.id ? (
                    <RenameRow initial={current.title} onSave={(title) => patchThread(current.id, { title })} onCancel={() => setRenaming(null)} />
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{current.title}</div>
                        <div style={{ fontSize: 12, color: "#777" }}>{MODE_LABEL[current.mode]} · {SCOPE_LABEL[current.scope]} · по умолчанию {TIER_LABEL[current.defaultTier]}</div>
                      </div>
                      <button type="button" style={btn} onClick={() => setRenaming(current.id)}>✎</button>
                      <button type="button" style={btn} onClick={() => patchThread(current.id, { archived: !current.archivedAt })}>{current.archivedAt ? "Вернуть" : "В архив"}</button>
                    </>
                  )}
                </div>
                {current.summary && (
                  <div style={{ border: "1px solid #e3e3e3", borderRadius: 8, padding: 8, marginBottom: 10, fontSize: 12, background: "#fafafa" }}>
                    <button type="button" style={{ ...btn, fontSize: 12 }} onClick={() => setShowSummary((v) => !v)}>
                      {showSummary ? "Скрыть" : "Показать"} краткое содержание ранней части беседы
                    </button>
                    {showSummary && <div style={{ whiteSpace: "pre-wrap", marginTop: 8, lineHeight: 1.5 }}>{current.summary}<div style={{ color: "#888", marginTop: 6 }}>Это пересказ обсуждения, а не Canon.</div></div>}
                  </div>
                )}
                {current.mode !== "CRITIC" &&
                  !current.archivedAt &&
                  shouldOfferSummary(
                    messages.length,
                    !!current.summary,
                    current.summaryUpToAt ? messages.filter((m) => new Date(m.createdAt) > new Date(current.summaryUpToAt as string)).length : messages.length
                  ) && (
                    <div style={{ marginBottom: 10, fontSize: 12, color: "#555" }}>
                      Беседа стала длинной: старые сообщения не попадают в запрос к модели целиком.{" "}
                      <button type="button" style={btn} disabled={summarizing} onClick={summarize}>
                        {summarizing ? "Сжимаю…" : "Сжать раннюю часть"}
                      </button>
                    </div>
                  )}
                {messages.length === 0 && <p style={{ color: "#666", fontSize: 14 }}>Задайте первый вопрос. Можно прикрепить выделенный фрагмент главы из редактора.</p>}
                {messages.map((m) => (
                  <MessageBubble key={m.id} m={m} revealed={!!revealed[m.id]} onReveal={() => setRevealed((r) => ({ ...r, [m.id]: !r[m.id] }))} />
                ))}
                {sending && streamText && (
                  <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
                    <div style={{ maxWidth: "92%", padding: 10, borderRadius: 12, background: "#fff", border: "1px dashed #bbb", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                      {streamText}
                      <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>идёт ответ ({TIER_LABEL[sending]}), ещё не сохранён…</div>
                    </div>
                  </div>
                )}
                {sending && !streamText && <div style={{ color: "#666", fontSize: 13, padding: "6px 0" }}>{current.mode === "CRITIC" ? "Критик читает главу" : "Соавтор думает"} ({TIER_LABEL[sending]})…</div>}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {view === "thread" && current && (
            <footer style={{ borderTop: "1px solid #eee", padding: 12 }}>
              {current.archivedAt ? (
                <div style={{ fontSize: 13, color: "#666" }}>Беседа в архиве. Верните её, чтобы продолжить.</div>
              ) : (
                <>
                  {fragment && <FragmentChip fragment={fragment} onRemove={() => setFragment(null)} />}
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    placeholder={current.mode === "CRITIC" ? "На что обратить внимание (необязательно)" : "Сообщение Соавтору"}
                    disabled={!!sending}
                    style={{ ...field, resize: "vertical" }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    {current.mode === "CRITIC" ? (
                      <>
                        <button type="button" style={primary} disabled={!!sending} onClick={() => send(current.defaultTier === "TERRA" ? "TERRA" : "LUNA")}>
                          Провести разбор ({TIER_LABEL[current.defaultTier]})
                        </button>
                        {current.defaultTier !== "TERRA" && (
                          <button type="button" style={btn} disabled={!!sending} onClick={() => send("TERRA")} title={TERRA_HINT}>
                            Разбор на Terra
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button type="button" style={primary} disabled={!!sending || !text.trim()} onClick={() => send(current.defaultTier === "TERRA" ? "TERRA" : "LUNA")}>
                          Отправить ({TIER_LABEL[current.defaultTier]})
                        </button>
                        {current.defaultTier !== "TERRA" && (
                          <button type="button" style={btn} disabled={!!sending || !text.trim()} onClick={() => send("TERRA")} title={TERRA_HINT}>
                            Спросить Terra
                          </button>
                        )}
                        {current.defaultTier === "TERRA" && (
                          <button type="button" style={btn} disabled={!!sending || !text.trim()} onClick={() => send("LUNA")}>
                            Спросить Luna
                          </button>
                        )}
                      </>
                    )}
                    {sending && abortRef.current && (
                      <button type="button" style={{ ...btn, color: "#b00020" }} onClick={stopStreaming}>
                        ■ Стоп
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#777", marginTop: 6 }}>
                    {budget ? `${budget.text}. ` : ""}Terra примерно в десять раз дороже Luna.{current.mode === "CRITIC" ? " Разбор читает главу целиком и стоит дороже обычного сообщения." : ""}
                  </div>
                </>
              )}
            </footer>
          )}
        </aside>
      )}
    </>
  );
}

function RenameRow({ initial, onSave, onCancel }: { initial: string; onSave: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ display: "flex", gap: 6, flex: 1 }}>
      <input autoFocus style={field} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) onSave(value.trim()); if (e.key === "Escape") onCancel(); }} />
      <button type="button" style={btn} disabled={!value.trim()} onClick={() => onSave(value.trim())}>OK</button>
      <button type="button" style={btn} onClick={onCancel}>✕</button>
    </div>
  );
}

function FragmentChip({ fragment, onRemove }: { fragment: FragmentPayload; onRemove: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: 8, marginBottom: 8, borderRadius: 8, background: "#f4f7fb", border: "1px solid #c9d8ea", fontSize: 12 }}>
      <div style={{ flex: 1 }}>
        <strong>Фрагмент главы</strong> ({fragment.text.length} зн.): «{fragment.text.length > 160 ? `${fragment.text.slice(0, 160)}…` : fragment.text}»
      </div>
      <button type="button" style={btn} onClick={onRemove} aria-label="Убрать фрагмент">✕</button>
    </div>
  );
}

function MessageBubble({ m, revealed, onReveal }: { m: Message; revealed: boolean; onReveal: () => void }) {
  const mine = m.role === "AUTHOR";
  const report = mine ? null : asReport(m.report);
  const segments = mine ? [{ text: m.text, spoiler: false }] : splitSpoilers(m.text, m.containsSpoiler);
  const cost = !mine ? costText(m.cost) : "";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
      <div style={{ maxWidth: "92%", padding: 10, borderRadius: 12, background: mine ? "#eef2f7" : "#fff", border: "1px solid #e3e3e3", fontSize: 14, lineHeight: 1.55 }}>
        {mine && m.fragmentText && (
          <div style={{ fontSize: 12, color: "#555", borderLeft: "3px solid #9bb7d4", paddingLeft: 8, marginBottom: 6 }}>
            Фрагмент: «{m.fragmentText.length > 200 ? `${m.fragmentText.slice(0, 200)}…` : m.fragmentText}»
          </div>
        )}
        {report ? (
          m.containsSpoiler && !revealed ? (
            <div style={{ padding: 8, margin: "4px 0", borderRadius: 8, background: "#fff6e0", border: "1px dashed #d9a400", fontSize: 13 }}>
              ⚠ Спойлер: отчёт затрагивает тайны сюжета.{" "}
              <button type="button" style={btn} onClick={onReveal}>Показать</button>
            </div>
          ) : (
            <ReportCard report={report} />
          )
        ) : null}
        {report ? null : segments.map((s, i) =>
          s.spoiler && !revealed ? (
            <div key={i} style={{ padding: 8, margin: "4px 0", borderRadius: 8, background: "#fff6e0", border: "1px dashed #d9a400", fontSize: 13 }}>
              ⚠ Спойлер: ответ затрагивает тайны сюжета.{" "}
              <button type="button" style={btn} onClick={onReveal}>Показать</button>
            </div>
          ) : (
            <div key={i} style={{ whiteSpace: "pre-wrap", ...(s.spoiler ? { background: "#fff6e0", padding: 6, borderRadius: 6 } : {}) }}>
              {s.text}
              {s.spoiler && <div><button type="button" style={{ ...btn, marginTop: 4 }} onClick={onReveal}>Скрыть спойлер</button></div>}
            </div>
          )
        )}
        {!mine && (
          <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
            {m.model === "mock" ? "заглушка AI_MOCK, без расходов" : [m.tier ? TIER_LABEL[m.tier] : null, cost].filter(Boolean).join(" · ")}
            {m.cost?.status === "UNKNOWN" && m.cost.assumedUsd ? ` (в лимит учтено ${formatUsd(m.cost.assumedUsd)})` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportCard({ report }: { report: ReportView }) {
  const clean = (t: string) => t.replace(/^\s*\[СПОЙЛЕР\]\s*/, "");
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Вердикт</div>
      <div style={{ whiteSpace: "pre-wrap", marginBottom: 10 }}>{report.verdict}</div>
      {report.problems.length === 0 ? (
        <div style={{ fontSize: 13, color: "#2a6" }}>Существенных проблем не найдено.</div>
      ) : (
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Проблемы ({report.problems.length})</div>
      )}
      {report.problems.map((p, i) => {
        const color = SEVERITY_COLOR[p.severity];
        return (
          <div key={i} style={{ background: color.bg, borderLeft: `4px solid ${color.border}`, borderRadius: 6, padding: 8, marginBottom: 8, fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, color: color.text }}>
              {i + 1}. {SEVERITY_LABEL[p.severity]} · {CATEGORY_LABEL[p.category as keyof typeof CATEGORY_LABEL] ?? p.category}
            </div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{clean(p.problem)}</div>
            <div style={{ color: "#555", marginTop: 4 }}><strong>Основание:</strong> {p.evidence}</div>
            <div style={{ color: "#555", marginTop: 4 }}><strong>Почему важно:</strong> {p.whyItMatters}</div>
            <div style={{ marginTop: 4 }}>
              <strong>Что сделать:</strong>
              <ul style={{ margin: "2px 0 0 18px", padding: 0 }}>{p.recommendations.map((r, j) => <li key={j}>{r}</li>)}</ul>
            </div>
          </div>
        );
      })}
      {report.strengths.length > 0 && (
        <div style={{ fontSize: 13, marginTop: 8 }}>
          <strong>Что работает:</strong>
          <ul style={{ margin: "2px 0 0 18px", padding: 0 }}>{report.strengths.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {report.questionsForAuthor.length > 0 && (
        <div style={{ fontSize: 13, marginTop: 8 }}>
          <strong>Вопросы к автору:</strong>
          <ul style={{ margin: "2px 0 0 18px", padding: 0 }}>{report.questionsForAuthor.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>Это мнение критика, а не решение. Canon не изменён.</div>
    </div>
  );
}
