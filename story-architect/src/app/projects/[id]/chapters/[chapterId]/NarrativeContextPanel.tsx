"use client";

import { useState } from "react";

type BeatView = { id: string; name: string; authority: "approved" | "preliminary"; approval: string; disclosure: string; chapters: string | null; details: string };
type SecretView = { id: string; name: string; level: string; levelLabel: string; forbiddenEarly: string | null; truthPassed: boolean };
type Preview = {
  chapterNumber: number;
  bookTitle: string | null;
  bookFields: { label: string; value: string }[];
  constraints: string | null;
  beats: Record<"past" | "current" | "near" | "far" | "unplaced", BeatView[]>;
  omitted: Record<"past" | "current" | "near" | "far" | "unplaced", number>;
  secrets: SecretView[];
  warnings: string[];
};
type Data = { isEmpty: boolean; preview: Preview; promptBlock: string; canonFactCount: number };

const GROUPS: [keyof Preview["beats"], string][] = [
  ["current", "Эта глава"],
  ["near", "Ближайшие главы"],
  ["past", "По плану уже должны были наступить"],
  ["far", "Отдалённое будущее"],
  ["unplaced", "Без номера главы"],
];

const card: React.CSSProperties = { border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 10, background: "#fff" };

export default function NarrativeContextPanel({ projectId, chapterId }: { projectId: string; chapterId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showText, setShowText] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/narrative-context`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка");
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const p = data?.preview;
  const approved = p ? GROUPS.flatMap(([k]) => p.beats[k].filter((b) => b.authority === "approved").map((b) => ({ ...b, group: k }))) : [];
  const preliminary = p ? GROUPS.flatMap(([k]) => p.beats[k].filter((b) => b.authority === "preliminary").map((b) => ({ ...b, group: k }))) : [];
  const groupTitle = (k: string) => GROUPS.find(([key]) => key === k)?.[1] ?? "";

  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>🧭 Долгосрочный контекст для Writer</h2>
      <p style={{ color: "#555" }}>
        Что Writer узнает из сюжетной карты. Предпросмотр содержит спойлеры, это не текст для публикации.
      </p>
      <button onClick={load} disabled={loading} style={{ padding: "6px 12px", cursor: "pointer" }}>
        {loading ? "Загрузка…" : data ? "Обновить" : "Показать контекст"}
      </button>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      {data && p && (
        <div style={{ marginTop: 16 }}>
          {p.warnings.length > 0 && (
            <div style={{ ...card, background: "#fff7e6", borderColor: "#f0c36d" }}>
              <strong>⚠️ Предупреждения</strong>
              <ul>{p.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          <div style={{ ...card, background: "#f3f3f3" }}>
            <strong>📚 Факты Canon</strong>: Writer получает их отдельно ({data.canonFactCount} шт. для главы {p.chapterNumber}). Ориентиры ниже Canon не отменяют.
          </div>

          {p.constraints && (
            <div style={{ ...card, background: "#fdecea", borderColor: "#e8a5a0" }}>
              <strong>⛔ Авторские ограничения</strong>
              <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{p.constraints}</p>
            </div>
          )}

          {p.bookFields.length > 0 && (
            <div style={card}>
              <strong>Замысел книги{p.bookTitle ? ` «${p.bookTitle}»` : ""}</strong>
              <ul>{p.bookFields.map((f) => <li key={f.label}><em>{f.label}:</em> {f.value}</li>)}</ul>
            </div>
          )}

          {approved.length > 0 && (
            <div style={{ ...card, background: "#eef7ee", borderColor: "#b7dbb7" }}>
              <strong>✅ Утверждённые ориентиры</strong>
              <ul>{approved.map((b) => <li key={b.id}><strong>{b.name}</strong> <small>({b.chapters ?? "без номера главы"}; {groupTitle(b.group)})</small>{b.details ? <div>{b.details}</div> : null}</li>)}</ul>
            </div>
          )}

          {preliminary.length > 0 && (
            <div style={{ ...card, background: "#fffdf0", borderColor: "#e6d98c" }}>
              <strong>💡 Предварительные идеи</strong> <small>(не факты, на них нельзя строить необратимое)</small>
              <ul>{preliminary.map((b) => <li key={b.id}><strong>{b.name}</strong> <small>({b.approval === "APPROXIMATE" ? "примерно" : "черновая идея"}; {b.chapters ?? "без номера главы"}; {groupTitle(b.group)})</small>{b.details ? <div>{b.details}</div> : null}</li>)}</ul>
            </div>
          )}

          {GROUPS.some(([k]) => p.omitted[k] > 0) && (
            <p style={{ color: "#555" }}>Часть вех не показана для экономии контекста: {GROUPS.filter(([k]) => p.omitted[k] > 0).map(([k, t]) => `${t} (+${p.omitted[k]})`).join(", ")}.</p>
          )}

          {p.secrets.length > 0 && (
            <div style={{ ...card, background: "#f3effb", borderColor: "#c9b7e8" }}>
              <strong>🔒 Тайны: допустимое раскрытие на главе {p.chapterNumber}</strong>
              <ul>
                {p.secrets.map((s) => (
                  <li key={s.id}>
                    <strong>{s.name}</strong>: {s.levelLabel}
                    {s.truthPassed ? <small> (истина передана Writer только для планирования)</small> : <small> (истина Writer не передаётся)</small>}
                    {s.forbiddenEarly && <div>Нельзя раньше времени: {s.forbiddenEarly}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.isEmpty && <p>Сюжетная карта пуста для этой главы: Writer работает как раньше.</p>}

          {data.promptBlock && (
            <div>
              <button onClick={() => setShowText(!showText)} style={{ padding: "4px 10px", cursor: "pointer" }}>
                {showText ? "Скрыть текст запроса" : "Показать точный текст для Writer"}
              </button>
              {showText && <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: 12, borderRadius: 8, marginTop: 8 }}>{data.promptBlock}</pre>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
