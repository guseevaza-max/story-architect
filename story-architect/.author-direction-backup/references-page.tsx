"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LABELS,
  REFERENCE_CATEGORIES,
  type AuthorReference,
} from "@/lib/authorIntent/schema";

type Draft = {
  id?: string;
  title: string;
  source: string;
  category: string;
  technique: string;
  instruction: string;
  notes: string;
  active: boolean;
  isDefault: boolean;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  source: "",
  category: "OTHER",
  technique: "",
  instruction: "",
  notes: "",
  active: true,
  isDefault: false,
};

const field = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 14,
  boxSizing: "border-box",
  fontFamily: "inherit",
} as const;

const label = { display: "block", fontWeight: 600, fontSize: 14 } as const;

export default function ReferencesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;

  const [references, setReferences] = useState<AuthorReference[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const url = `/api/projects/${projectId}/references`;

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    async function load() {
      setLoaded(false);
      setLoadError("");

      try {
        const response = await fetch(url);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Не удалось загрузить референсы.");
        }

        if (cancelled) return;

        setReferences(Array.isArray(data.references) ? data.references : []);
        setLoaded(true);
      } catch (failure) {
        if (cancelled) return;

        setLoadError(
          failure instanceof Error
            ? failure.message
            : "Не удалось загрузить референсы."
        );
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId, url, reloadKey]);

  // Любое изменение сразу сохраняется: библиотека всегда актуальна на сервере.
  async function persist(next: AuthorReference[]): Promise<boolean> {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ references: next }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить референсы.");
      }

      setReferences(Array.isArray(data.references) ? data.references : next);
      setMessage("✓ Сохранено");

      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось сохранить референсы."
      );

      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;

    if (!draft.title.trim()) {
      setError("Укажите название референса.");
      return;
    }

    const item = {
      ...draft,
      title: draft.title.trim(),
      category: draft.category as AuthorReference["category"],
      source: draft.source.trim() || undefined,
      technique: draft.technique.trim() || undefined,
      instruction: draft.instruction.trim() || undefined,
      notes: draft.notes.trim() || undefined,
    };

    const next = draft.id
      ? references.map((reference) =>
          reference.id === draft.id ? { ...reference, ...item, id: draft.id } : reference
        )
      : [...references, item as unknown as AuthorReference];

    if (await persist(next)) setDraft(null);
  }

  async function toggle(id: string, key: "active" | "isDefault") {
    await persist(
      references.map((reference) =>
        reference.id === id
          ? { ...reference, [key]: !reference[key] }
          : reference
      )
    );
  }

  async function remove(reference: AuthorReference) {
    if (!window.confirm(`Удалить референс «${reference.title}»?`)) return;

    await persist(references.filter((item) => item.id !== reference.id));
  }

  function edit(reference: AuthorReference) {
    setError("");
    setMessage("");
    setDraft({
      id: reference.id,
      title: reference.title,
      source: reference.source ?? "",
      category: reference.category,
      technique: reference.technique ?? "",
      instruction: reference.instruction ?? "",
      notes: reference.notes ?? "",
      active: reference.active,
      isDefault: reference.isDefault,
    });
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 40,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <Link href={`/projects/${projectId}`}>← Назад в проект</Link>
      </div>

      <h1 style={{ marginBottom: 8 }}>Референсы</h1>
      <p style={{ color: "#666", lineHeight: 1.6, marginTop: 0 }}>
        Конкретные художественные приёмы, которые вы хотите применять: темп,
        атмосфера, диалоги, развитие героя, драматургия. Опишите сам приём, а
        не просто имя автора. Референсы влияют на исполнение главы, но не
        меняют Canon.
      </p>

      {loadError && (
        <div style={{ color: "#991b1b", marginBottom: 16 }}>
          ⚠️ {loadError}{" "}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
            Повторить
          </button>
        </div>
      )}

      {!loaded && !loadError && <p style={{ color: "#666" }}>Загрузка…</p>}

      {loaded && !draft && (
        <button
          type="button"
          onClick={() => {
            setError("");
            setMessage("");
            setDraft(EMPTY_DRAFT);
          }}
          style={{
            padding: "11px 18px",
            borderRadius: 8,
            border: "none",
            background: "#111",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: 20,
          }}
        >
          ＋ Новый референс
        </button>
      )}

      {draft && (
        <section
          style={{
            border: "2px solid #d9c58b",
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
            background: "#fffdf5",
            display: "grid",
            gap: 14,
          }}
        >
          <h2 style={{ margin: 0 }}>
            {draft.id ? "Редактирование референса" : "Новый референс"}
          </h2>

          <label>
            <span style={label}>Название *</span>
            <input
              value={draft.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="Медленное нарастание тревоги перед масштабным событием"
              style={{ ...field, marginTop: 6 }}
            />
          </label>

          <label>
            <span style={label}>Автор или произведение-источник</span>
            <input
              value={draft.source}
              onChange={(event) => update("source", event.target.value)}
              placeholder="необязательно"
              style={{ ...field, marginTop: 6 }}
            />
          </label>

          <label>
            <span style={label}>Категория</span>
            <select
              value={draft.category}
              onChange={(event) => update("category", event.target.value)}
              style={{ ...field, marginTop: 6 }}
            >
              {REFERENCE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {LABELS.category[category]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={label}>Описание приёма</span>
            <textarea
              value={draft.technique}
              onChange={(event) => update("technique", event.target.value)}
              rows={3}
              placeholder="Какой именно художественный принцип вы хотите использовать"
              style={{ ...field, marginTop: 6, resize: "vertical" }}
            />
          </label>

          <label>
            <span style={label}>Инструкция для ИИ</span>
            <textarea
              value={draft.instruction}
              onChange={(event) => update("instruction", event.target.value)}
              rows={3}
              placeholder="Как именно применять приём при работе над главой"
              style={{ ...field, marginTop: 6, resize: "vertical" }}
            />
          </label>

          <label>
            <span style={label}>Мои заметки (в промпты не попадают)</span>
            <textarea
              value={draft.notes}
              onChange={(event) => update("notes", event.target.value)}
              rows={2}
              style={{ ...field, marginTop: 6, resize: "vertical" }}
            />
          </label>

          <label style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => update("active", event.target.checked)}
            />{" "}
            Активен
          </label>

          <label style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(event) => update("isDefault", event.target.checked)}
            />{" "}
            Применять ко всем главам по умолчанию (если в главе не выбраны свои)
          </label>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving}
              style={{
                padding: "11px 18px",
                borderRadius: 8,
                border: "none",
                background: saving ? "#777" : "#111",
                color: "#fff",
                fontWeight: 600,
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Сохранение…" : "💾 Сохранить референс"}
            </button>

            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setError("");
              }}
              disabled={saving}
              style={{
                padding: "11px 18px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Отмена
            </button>
          </div>
        </section>
      )}

      {message && <p style={{ color: "#26733a" }}>{message}</p>}
      {error && <p style={{ color: "#991b1b" }}>⚠️ {error}</p>}

      {loaded && references.length === 0 && !draft && (
        <p style={{ color: "#666" }}>
          Референсов пока нет. Добавьте первый, например «Контраст спокойных
          сцен и резких кульминаций».
        </p>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {references.map((reference) => (
          <article
            key={reference.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 18,
              background: "#fff",
              opacity: reference.active ? 1 : 0.6,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <h3 style={{ margin: 0 }}>{reference.title}</h3>

              <span style={{ fontSize: 12, color: "#555", whiteSpace: "nowrap" }}>
                {LABELS.category[reference.category]}
                {reference.isDefault ? " · по умолчанию" : ""}
                {reference.active ? "" : " · неактивен"}
              </span>
            </div>

            {reference.source && (
              <p style={{ margin: "6px 0 0", color: "#777", fontSize: 14 }}>
                Источник: {reference.source}
              </p>
            )}

            {reference.technique && (
              <p style={{ lineHeight: 1.6, marginBottom: 6 }}>
                <strong>Приём:</strong> {reference.technique}
              </p>
            )}

            {reference.instruction && (
              <p style={{ lineHeight: 1.6, margin: "6px 0" }}>
                <strong>Инструкция для ИИ:</strong> {reference.instruction}
              </p>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button type="button" onClick={() => edit(reference)} disabled={saving}>
                Изменить
              </button>
              <button
                type="button"
                onClick={() => void toggle(reference.id, "active")}
                disabled={saving}
              >
                {reference.active ? "Отключить" : "Включить"}
              </button>
              <button
                type="button"
                onClick={() => void toggle(reference.id, "isDefault")}
                disabled={saving}
              >
                {reference.isDefault ? "Убрать из «по умолчанию»" : "Сделать «по умолчанию»"}
              </button>
              <button
                type="button"
                onClick={() => void remove(reference)}
                disabled={saving}
                style={{ color: "#991b1b" }}
              >
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
