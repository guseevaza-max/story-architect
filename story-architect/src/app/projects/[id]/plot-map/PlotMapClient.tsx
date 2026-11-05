"use client";

import { useCallback, useEffect, useState } from "react";

const APPROVALS: Record<string, string> = {
  APPROVED: "утверждено",
  APPROXIMATE: "примерно",
  IDEA: "черновая идея",
};
const DISCLOSURES: Record<string, string> = {
  HIDDEN: "скрыто от читателя",
  HINTED: "только намёки",
  PARTIAL: "раскрыто частично",
  REVEALED: "раскрыто полностью",
};

type Beat = {
  id: string;
  name: string;
  description: string | null;
  narrativeFunction: string | null;
  characters: string[] | null;
  causes: string | null;
  consequences: string | null;
  plannedChapterFrom: number | null;
  plannedChapterTo: number | null;
  approval: string;
  disclosure: string;
  notes: string | null;
};
type Secret = {
  id: string;
  name: string;
  objectiveTruth: string | null;
  hintFromChapter: number | null;
  partialRevealChapter: number | null;
  plannedRevealChapter: number | null;
  forbiddenEarly: string | null;
};
type Book = Record<string, string | null> | null;

const box: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 12, padding: 16, background: "#fff", marginBottom: 12 };
const input: React.CSSProperties = { width: "100%", padding: 6, boxSizing: "border-box", marginBottom: 8 };
const btn: React.CSSProperties = { padding: "6px 12px", cursor: "pointer", marginRight: 6 };

const num = (v: string) => (v.trim() === "" ? null : Number(v));

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Ошибка запроса");
  return data;
}

export default function PlotMapClient({ projectId }: { projectId: string }) {
  const base = `/api/projects/${projectId}/plot-map`;
  const [book, setBook] = useState<Book>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editBeat, setEditBeat] = useState<Partial<Beat> | null>(null);
  const [editSecret, setEditSecret] = useState<Partial<Secret> | null>(null);
  const [bookDraft, setBookDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await send(base, "GET");
      setBook(data.book);
      setBeats(data.beats);
      setSecrets(data.secrets);
      setBookDraft({
        premise: data.book?.premise ?? "",
        mainArc: data.book?.mainArc ?? "",
        plannedEnding: data.book?.plannedEnding ?? "",
        themes: data.book?.themes ?? "",
        centralConflicts: data.book?.centralConflicts ?? "",
        authorConstraints: data.book?.authorConstraints ?? "",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const move = (index: number, delta: number) => {
    const ids = beats.map((b) => b.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const a = ids[index];
    const b = ids[target];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[target] = a;
    void run(() => send(`${base}/beats/reorder`, "POST", { ids }));
  };

  const saveBeat = () =>
    run(async () => {
      const b = editBeat!;
      const payload = {
        name: b.name ?? "",
        description: b.description ?? "",
        narrativeFunction: b.narrativeFunction ?? "",
        characters: b.characters ?? [],
        causes: b.causes ?? "",
        consequences: b.consequences ?? "",
        plannedChapterFrom: b.plannedChapterFrom ?? null,
        plannedChapterTo: b.plannedChapterTo ?? null,
        approval: b.approval ?? "IDEA",
        disclosure: b.disclosure ?? "HIDDEN",
        notes: b.notes ?? "",
      };
      if (b.id) await send(`${base}/beats/${b.id}`, "PATCH", payload);
      else await send(`${base}/beats`, "POST", payload);
      setEditBeat(null);
    });

  const saveSecret = () =>
    run(async () => {
      const s = editSecret!;
      const payload = {
        name: s.name ?? "",
        objectiveTruth: s.objectiveTruth ?? "",
        forbiddenEarly: s.forbiddenEarly ?? "",
        hintFromChapter: s.hintFromChapter ?? null,
        partialRevealChapter: s.partialRevealChapter ?? null,
        plannedRevealChapter: s.plannedRevealChapter ?? null,
      };
      if (s.id) await send(`${base}/secrets/${s.id}`, "PATCH", payload);
      else await send(`${base}/secrets`, "POST", payload);
      setEditSecret(null);
    });

  if (loading) return <p>Загрузка…</p>;

  const bookFields: [string, string][] = [
    ["premise", "Предпосылка"],
    ["mainArc", "Главная арка"],
    ["plannedEnding", "Предполагаемый финал"],
    ["themes", "Главные темы"],
    ["centralConflicts", "Центральные конфликты"],
    ["authorConstraints", "Авторские ограничения (чего не должно быть)"],
  ];

  return (
    <div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      <section style={box}>
        <h2>Замысел книги</h2>
        {bookFields.map(([key, label]) => (
          <label key={key}>
            {label}
            <textarea
              rows={2}
              style={input}
              value={bookDraft[key] ?? ""}
              onChange={(e) => setBookDraft({ ...bookDraft, [key]: e.target.value })}
            />
          </label>
        ))}
        <button style={btn} onClick={() => run(() => send(`${base}/book`, "PATCH", bookDraft))}>
          Сохранить замысел
        </button>
        {!book && <small> Книга ещё не создана — создастся при сохранении.</small>}
      </section>

      <section style={box}>
        <h2>Сюжетные вехи</h2>
        {beats.length === 0 && <p style={{ color: "#555" }}>Вех пока нет. Начни с нескольких крупных.</p>}
        {beats.map((b, i) => (
          <div key={b.id} style={{ borderTop: "1px solid #eee", padding: "8px 0" }}>
            <strong>
              {i + 1}. {b.name}
            </strong>{" "}
            <small>
              [{APPROVALS[b.approval]}] · {DISCLOSURES[b.disclosure]} ·{" "}
              {b.plannedChapterFrom
                ? `гл. ${b.plannedChapterFrom}${b.plannedChapterTo ? `–${b.plannedChapterTo}` : ""}`
                : "глава не назначена"}
            </small>
            {b.description && <p style={{ margin: "4px 0" }}>{b.description}</p>}
            <button style={btn} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button style={btn} onClick={() => move(i, 1)} disabled={i === beats.length - 1}>↓</button>
            <button style={btn} onClick={() => setEditBeat(b)}>Изменить</button>
            <button
              style={btn}
              onClick={() => {
                if (confirm(`Удалить веху «${b.name}»?`)) void run(() => send(`${base}/beats/${b.id}`, "DELETE"));
              }}
            >
              Удалить
            </button>
          </div>
        ))}
        {editBeat ? (
          <div style={{ ...box, background: "#fafafa" }}>
            <input style={input} placeholder="Название" value={editBeat.name ?? ""} onChange={(e) => setEditBeat({ ...editBeat, name: e.target.value })} />
            <textarea style={input} rows={3} placeholder="Описание" value={editBeat.description ?? ""} onChange={(e) => setEditBeat({ ...editBeat, description: e.target.value })} />
            <input style={input} placeholder="Сюжетная функция" value={editBeat.narrativeFunction ?? ""} onChange={(e) => setEditBeat({ ...editBeat, narrativeFunction: e.target.value })} />
            <input style={input} placeholder="Персонажи через запятую" value={(editBeat.characters ?? []).join(", ")} onChange={(e) => setEditBeat({ ...editBeat, characters: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            <textarea style={input} rows={2} placeholder="Причинные предпосылки" value={editBeat.causes ?? ""} onChange={(e) => setEditBeat({ ...editBeat, causes: e.target.value })} />
            <textarea style={input} rows={2} placeholder="Последствия" value={editBeat.consequences ?? ""} onChange={(e) => setEditBeat({ ...editBeat, consequences: e.target.value })} />
            <input style={{ ...input, width: 140 }} placeholder="Глава от" value={editBeat.plannedChapterFrom ?? ""} onChange={(e) => setEditBeat({ ...editBeat, plannedChapterFrom: num(e.target.value) })} />{" "}
            <input style={{ ...input, width: 140 }} placeholder="Глава до" value={editBeat.plannedChapterTo ?? ""} onChange={(e) => setEditBeat({ ...editBeat, plannedChapterTo: num(e.target.value) })} />
            <div>
              <select value={editBeat.approval ?? "IDEA"} onChange={(e) => setEditBeat({ ...editBeat, approval: e.target.value })}>
                {Object.entries(APPROVALS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>{" "}
              <select value={editBeat.disclosure ?? "HIDDEN"} onChange={(e) => setEditBeat({ ...editBeat, disclosure: e.target.value })}>
                {Object.entries(DISCLOSURES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <textarea style={{ ...input, marginTop: 8 }} rows={2} placeholder="Заметки" value={editBeat.notes ?? ""} onChange={(e) => setEditBeat({ ...editBeat, notes: e.target.value })} />
            <button style={btn} onClick={saveBeat}>Сохранить веху</button>
            <button style={btn} onClick={() => setEditBeat(null)}>Отмена</button>
          </div>
        ) : (
          <button style={btn} onClick={() => setEditBeat({ approval: "IDEA", disclosure: "HIDDEN", characters: [] })}>
            + Добавить веху
          </button>
        )}
      </section>

      <section style={box}>
        <h2>Тайны и план раскрытия</h2>
        {secrets.length === 0 && <p style={{ color: "#555" }}>Тайн пока нет.</p>}
        {secrets.map((s) => (
          <div key={s.id} style={{ borderTop: "1px solid #eee", padding: "8px 0" }}>
            <strong>{s.name}</strong>{" "}
            <small>
              намёки с гл. {s.hintFromChapter ?? "—"} · частично гл. {s.partialRevealChapter ?? "—"} · полностью гл. {s.plannedRevealChapter ?? "—"}
            </small>
            {s.forbiddenEarly && <p style={{ margin: "4px 0" }}>Нельзя раскрывать раньше: {s.forbiddenEarly}</p>}
            <button style={btn} onClick={() => setEditSecret(s)}>Изменить</button>
          </div>
        ))}
        {editSecret ? (
          <div style={{ ...box, background: "#fafafa" }}>
            <input style={input} placeholder="Название тайны" value={editSecret.name ?? ""} onChange={(e) => setEditSecret({ ...editSecret, name: e.target.value })} />
            <textarea style={input} rows={2} placeholder="Объективная истина мира" value={editSecret.objectiveTruth ?? ""} onChange={(e) => setEditSecret({ ...editSecret, objectiveTruth: e.target.value })} />
            <textarea style={input} rows={2} placeholder="Что категорически нельзя раскрывать раньше времени" value={editSecret.forbiddenEarly ?? ""} onChange={(e) => setEditSecret({ ...editSecret, forbiddenEarly: e.target.value })} />
            <input style={{ ...input, width: 160 }} placeholder="Намёки с главы" value={editSecret.hintFromChapter ?? ""} onChange={(e) => setEditSecret({ ...editSecret, hintFromChapter: num(e.target.value) })} />{" "}
            <input style={{ ...input, width: 180 }} placeholder="Частично с главы" value={editSecret.partialRevealChapter ?? ""} onChange={(e) => setEditSecret({ ...editSecret, partialRevealChapter: num(e.target.value) })} />{" "}
            <input style={{ ...input, width: 180 }} placeholder="Полностью в главе" value={editSecret.plannedRevealChapter ?? ""} onChange={(e) => setEditSecret({ ...editSecret, plannedRevealChapter: num(e.target.value) })} />
            <div>
              <button style={btn} onClick={saveSecret}>Сохранить тайну</button>
              <button style={btn} onClick={() => setEditSecret(null)}>Отмена</button>
            </div>
          </div>
        ) : (
          <button style={btn} onClick={() => setEditSecret({})}>+ Добавить тайну</button>
        )}
      </section>
    </div>
  );
}
