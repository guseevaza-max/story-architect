"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DRAMA_VALUES,
  FOCUS_VALUES,
  LABELS,
  PACE_VALUES,
  SCALE_VALUES,
  type AuthorReference,
} from "@/lib/authorIntent/schema";

type Mode = "inherit" | "custom";

type Form = {
  scale: string;
  drama: string;
  pace: string;
  focus: string;
  freePrompt: string;
  readerEffect: string;
  emotionalArc: string;
  mustInclude: string;
  avoid: string;
  compositionNotes: string;
};

const EMPTY: Form = {
  scale: "",
  drama: "",
  pace: "",
  focus: "",
  freePrompt: "",
  readerEffect: "",
  emotionalArc: "",
  mustInclude: "",
  avoid: "",
  compositionNotes: "",
};

const fieldStyle = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 14,
  boxSizing: "border-box",
  fontFamily: "inherit",
} as const;

const labelStyle = { display: "block", fontWeight: 600, fontSize: 14 } as const;

export default function AuthorIntentPanel({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<Form>(EMPTY);
  const [references, setReferences] = useState<AuthorReference[]>([]);
  const [mode, setMode] = useState<Mode>("inherit");
  const [selected, setSelected] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const url = `/api/projects/${projectId}/chapters/${chapterId}/intent`;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoaded(false);
      setLoadError("");

      try {
        const response = await fetch(url);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Не удалось загрузить замысел.");
        }

        if (cancelled) return;

        const intent = data.intent ?? {};

        setForm({
          scale: intent.scale ?? "",
          drama: intent.drama ?? "",
          pace: intent.pace ?? "",
          focus: intent.focus ?? "",
          freePrompt: intent.freePrompt ?? "",
          readerEffect: intent.readerEffect ?? "",
          emotionalArc: intent.emotionalArc ?? "",
          mustInclude: intent.mustInclude ?? "",
          avoid: intent.avoid ?? "",
          compositionNotes: intent.compositionNotes ?? "",
        });

        setReferences(Array.isArray(data.references) ? data.references : []);

        if (Array.isArray(intent.referenceIds)) {
          setMode("custom");
          setSelected(intent.referenceIds);
        } else {
          setMode("inherit");
          setSelected([]);
        }

        setDirty(false);
        setLoaded(true);
      } catch (failure) {
        if (cancelled) return;

        setLoadError(
          failure instanceof Error
            ? failure.message
            : "Не удалось загрузить замысел."
        );
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [url, reloadKey]);

  // Предупреждение браузера при закрытии вкладки с несохранёнными настройками.
  useEffect(() => {
    if (!dirty) return;

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(field: keyof Form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setMessage("");
  }

  function toggleReference(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
    setDirty(true);
    setMessage("");
  }

  async function save(intent: Record<string, unknown>) {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить замысел.");
      }

      setDirty(false);
      setMessage("✓ Авторский замысел сохранён");

      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось сохранить замысел."
      );

      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    void save({
      scale: form.scale || null,
      drama: form.drama || null,
      pace: form.pace || null,
      focus: form.focus || null,
      referenceIds: mode === "custom" ? selected : undefined,
      freePrompt: form.freePrompt,
      readerEffect: form.readerEffect,
      emotionalArc: form.emotionalArc,
      mustInclude: form.mustInclude,
      avoid: form.avoid,
      compositionNotes: form.compositionNotes,
    });
  }

  async function handleClear() {
    if (
      !window.confirm(
        "Очистить авторский замысел этой главы? Референсы проекта останутся."
      )
    ) {
      return;
    }

    if (await save({})) {
      setForm(EMPTY);
      setMode("inherit");
      setSelected([]);
    }
  }

  const activeReferences = references.filter((reference) => reference.active);
  const defaultCount = activeReferences.filter((r) => r.isDefault).length;

  if (loadError) {
    return (
      <div style={{ color: "#991b1b", lineHeight: 1.6 }}>
        ⚠️ {loadError}{" "}
        <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
          Повторить
        </button>
      </div>
    );
  }

  if (!loaded) {
    return <p style={{ color: "#666" }}>Загрузка авторского замысла…</p>;
  }

  const select = (
    label: string,
    field: "scale" | "drama" | "pace" | "focus",
    values: readonly string[],
    names: Record<string, string>
  ) => (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      <select
        value={form[field]}
        onChange={(event) => change(field, event.target.value)}
        style={{ ...fieldStyle, marginTop: 6 }}
      >
        <option value="">не задано</option>
        {values.map((value) => (
          <option key={value} value={value}>
            {names[value]}
          </option>
        ))}
      </select>
    </label>
  );

  const text = (
    label: string,
    field: keyof Form,
    rows: number,
    placeholder: string
  ) => (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      <textarea
        value={form[field]}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => change(field, event.target.value)}
        style={{ ...fieldStyle, marginTop: 6, resize: "vertical" }}
      />
    </label>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ margin: 0, color: "#666", lineHeight: 1.6, fontSize: 14 }}>
        Как вы хотите видеть эту главу. Замысел определяет художественное
        исполнение и не меняет Canon: утверждённые факты, характеры и планы
        остаются выше.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 14,
        }}
      >
        {select("Масштабность", "scale", SCALE_VALUES, LABELS.scale)}
        {select("Драматичность", "drama", DRAMA_VALUES, LABELS.drama)}
        {select("Темп", "pace", PACE_VALUES, LABELS.pace)}
        {select("Основной акцент", "focus", FOCUS_VALUES, LABELS.focus)}
      </div>

      {text(
        "Мой промпт: как должна выглядеть глава",
        "freePrompt",
        5,
        "Начать с тихой, почти камерной сцены. Постепенно раскрывать масштаб происходящего. Не торопить кульминацию..."
      )}
      {text(
        "Желаемый эффект на читателя",
        "readerEffect",
        2,
        "Ощущение, что герой столкнулся с чем-то значительно большим, чем способен понять"
      )}
      {text(
        "Эмоциональная траектория главы",
        "emotionalArc",
        2,
        "От тишины и любопытства к тревоге и растерянности"
      )}
      {text("Обязательные элементы", "mustInclude", 2, "Что обязательно должно быть")}
      {text("Чего следует избегать", "avoid", 2, "Чего в этой главе быть не должно")}
      {text(
        "Композиция и финал",
        "compositionNotes",
        2,
        "Дополнительные указания по построению и концовке"
      )}

      <fieldset style={{ border: "1px solid #ddd", borderRadius: 8, padding: 14 }}>
        <legend style={{ fontWeight: 600, fontSize: 14 }}>Референсы</legend>

        {activeReferences.length === 0 ? (
          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
            В проекте пока нет активных референсов.{" "}
            <Link href={`/projects/${projectId}/references`}>
              Создать референс →
            </Link>
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 14 }}>
              <input
                type="radio"
                checked={mode === "inherit"}
                onChange={() => {
                  setMode("inherit");
                  setDirty(true);
                  setMessage("");
                }}
              />{" "}
              Референсы проекта по умолчанию ({defaultCount})
            </label>

            <label style={{ fontSize: 14 }}>
              <input
                type="radio"
                checked={mode === "custom"}
                onChange={() => {
                  setMode("custom");
                  setDirty(true);
                  setMessage("");
                }}
              />{" "}
              Выбрать референсы для этой главы
            </label>

            {mode === "custom" && (
              <div style={{ display: "grid", gap: 6, paddingLeft: 24 }}>
                {activeReferences.map((reference) => (
                  <label key={reference.id} style={{ fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(reference.id)}
                      onChange={() => toggleReference(reference.id)}
                    />{" "}
                    <strong>{reference.title}</strong>
                    <span style={{ color: "#777" }}>
                      {" "}
                      · {LABELS.category[reference.category]}
                    </span>
                  </label>
                ))}

                {selected.length === 0 && (
                  <span style={{ color: "#777", fontSize: 13 }}>
                    Ничего не отмечено: референсы в этой главе не применяются.
                  </span>
                )}
              </div>
            )}

            <Link
              href={`/projects/${projectId}/references`}
              style={{ fontSize: 14 }}
            >
              Управлять библиотекой референсов →
            </Link>
          </div>
        )}
      </fieldset>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleSave}
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
          {saving ? "Сохранение…" : "💾 Сохранить замысел"}
        </button>

        <button
          type="button"
          onClick={() => void handleClear()}
          disabled={saving}
          style={{
            padding: "11px 18px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: saving ? "default" : "pointer",
          }}
        >
          Очистить
        </button>

        {dirty && !saving && (
          <span style={{ color: "#8a5a00", fontSize: 14 }}>
            Есть несохранённые изменения
          </span>
        )}
        {message && <span style={{ color: "#26733a", fontSize: 14 }}>{message}</span>}
        {error && <span style={{ color: "#991b1b", fontSize: 14 }}>⚠️ {error}</span>}
      </div>
    </div>
  );
}
