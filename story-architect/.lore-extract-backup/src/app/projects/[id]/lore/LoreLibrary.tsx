"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Material = {
  id: string;
  title: string;
  category: string;
  content: string;
  updatedAt: string;
};

const categories = [
  ["GENERAL", "Общие сведения"],
  ["STATE", "Государства и народы"],
  ["LOCATION", "Локации и архитектура"],
  ["TECHNOLOGY", "Технологии"],
  ["MATERIALS", "Материалы и предметы"],
  ["CULTURE", "Культура и быт"],
  ["CHARACTERS", "Персонажи"],
  ["HISTORY", "История и хронология"],
  ["RULES", "Правила мира"],
  ["OTHER", "Другое"],
];

const blank = { title: "", category: "GENERAL", content: "" };

export default function LoreLibrary({ projectId }: { projectId: string }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const url = `/api/projects/${projectId}/lore`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить материалы.");
      setMaterials(data.materials ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { void load(); }, [load]);

  function edit(material: Material) {
    setEditingId(material.id);
    setForm({ title: material.title, category: material.category, content: material.content });
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(blank);
    setError("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...(editingId ? { id: editingId } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить материал.");
      setForm(blank);
      setEditingId(null);
      setNotice(editingId ? "Изменения сохранены." : "Материал добавлен.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(material: Material) {
    if (!window.confirm(`Удалить материал «${material.title}»? Это действие нельзя отменить.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: material.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось удалить материал.");
      if (editingId === material.id) cancelEdit();
      setNotice("Материал удалён.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: 12, border: "1px solid #ccc",
    borderRadius: 8, font: "inherit", boxSizing: "border-box",
  };

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32, fontFamily: "Arial, sans-serif" }}>
      <p><Link href={`/projects/${projectId}`}>← Назад в проект</Link></p>
      <h1>📚 Материалы мира</h1>
      <p style={{ color: "#666", lineHeight: 1.6 }}>
        Храни здесь исходные заметки о мире «Паралакса»: государства, локации,
        технологии, материалы, культуру и историю. Сохранение материалов не меняет Canon.
      </p>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 24, marginTop: 24 }}>
        <h2>{editingId ? "Редактировать материал" : "Добавить материал"}</h2>
        <form onSubmit={save} style={{ display: "grid", gap: 14 }}>
          <label>
            Название
            <input required maxLength={200} value={form.title} style={{ ...inputStyle, marginTop: 6 }}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </label>
          <label>
            Категория
            <select value={form.category} style={{ ...inputStyle, marginTop: 6 }}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Исходный текст
            <textarea required value={form.content} maxLength={200000} rows={14}
              placeholder="Вставь сюда заметки, описание места, выдержку из документа или правила мира…"
              style={{ ...inputStyle, marginTop: 6, resize: "vertical", lineHeight: 1.6 }}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
            <small style={{ color: "#777" }}>{form.content.length.toLocaleString("ru-RU")} / 200 000 символов</small>
          </label>
          {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
          {notice && <p role="status" style={{ color: "#26733a" }}>{notice}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button disabled={busy} type="submit" style={{ padding: "11px 18px", borderRadius: 8, cursor: "pointer" }}>
              {busy ? "Сохраняю…" : editingId ? "Сохранить изменения" : "Добавить материал"}
            </button>
            {editingId && <button type="button" disabled={busy} onClick={cancelEdit} style={{ padding: "11px 18px", borderRadius: 8 }}>Отмена</button>}
          </div>
        </form>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Сохранённые материалы ({materials.length})</h2>
        {loading ? <p>Загружаю материалы…</p> :
          materials.length === 0 ? <p style={{ color: "#666" }}>Пока пусто. Добавь первый материал выше.</p> :
          <div style={{ display: "grid", gap: 14 }}>
            {materials.map(m => (
              <article key={m.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ margin: "0 0 8px" }}>{m.title}</h3>
                    <small style={{ color: "#666" }}>
                      {categories.find(([value]) => value === m.category)?.[1] ?? "Другое"}
                      {" · "}Изменён: {new Date(m.updatedAt).toLocaleString("ru-RU")}
                    </small>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled={busy} onClick={() => edit(m)}>Редактировать</button>
                    <button disabled={busy} onClick={() => void remove(m)}>Удалить</button>
                  </div>
                </div>
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.6, marginBottom: 0 }}>
                  {m.content.length > 1200 ? `${m.content.slice(0, 1200)}…` : m.content}
                </p>
                {m.content.length > 1200 && <small style={{ color: "#666" }}>Показана часть текста. Полный текст доступен при редактировании.</small>}
              </article>
            ))}
          </div>}
      </section>
    </main>
  );
}
