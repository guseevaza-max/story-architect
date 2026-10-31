"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DraftEditor({
  projectId,
  chapterId,
  initialText,
}: {
  projectId: string;
  chapterId: string;
  initialText: string;
}) {
  const router = useRouter();

  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const templates = [
    {
      title: "Свободные заметки",
      text: "ЗАМЫСЕЛ И МЫСЛИ\n\nЧто происходит:\n\nЧто важно не забыть:\n\nВопросы к себе:\n",
    },
    {
      title: "Шаблон сцены",
      text: "СЦЕНА\n\nМесто и время:\n\nУчастники:\n\nЦель сцены:\n\nЧто происходит по шагам:\n1. \n2. \n3. \n\nЧто меняется к концу сцены:\n\nАтмосфера и ощущения:\n\nСвязь с лором и Canon:\n",
    },
    {
      title: "Описание мира",
      text: "ЗАМЕТКА О МИРЕ\n\nОбъект / место / государство:\n\nОписание:\n\nТехнологии и материалы:\n\nКультура и быт:\n\nК какому месту и периоду относится:\n\nИсточник или основание факта:\n\nСтатус: требует проверки автором\n",
    },
    {
      title: "Диалог",
      text: "ДИАЛОГ\n\nМесто и ситуация:\n\nУчастники и их цели:\n\n— Реплика персонажа.\n— Ответ.\n\nЧто персонажи не говорят прямо:\n\nЧто меняется после разговора:\n",
    },
  ];

  function insertTemplate(template: string) {
    setText((current) =>
      current.trim()
        ? current.replace(/\s*$/, "") + "\n\n" + template
        : template
    );
    setSaved(false);
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draftText: text,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Не удалось сохранить черновик."
        );
        return;
      }

      setSaved(true);
      router.refresh();
    } catch (error) {
      console.error(error);

      setError(
        "Ошибка соединения с сервером."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14, padding: 14, border: "1px solid #ddd", borderRadius: 10, background: "#fafafa" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Шаблоны черновика</div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#666", lineHeight: 1.5 }}>
          Выбирай подходящую болванку или просто пиши как удобно. Шаблон добавляется в конец текста и не удаляет уже написанное.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {templates.map((template) => (
            <button
              key={template.title}
              type="button"
              onClick={() => insertTemplate(template.text)}
              style={{
                padding: "8px 12px",
                border: "1px solid #ccc",
                borderRadius: 8,
                background: "#fff",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              + {template.title}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setSaved(false);
        }}
        style={{
          width: "100%",
          minHeight: 700,
          padding: 20,
          boxSizing: "border-box",
          border: "1px solid #ccc",
          borderRadius: 10,
          resize: "vertical",
          fontFamily:
            "Georgia, 'Times New Roman', serif",
          fontSize: 17,
          lineHeight: 1.8,
          color: "#222",
          background: "#fff",
          outline: "none",
        }}
        placeholder="Черновик главы появится здесь..."
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 14,
        }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "11px 18px",
            borderRadius: 8,
            border: "none",
            background: saving
              ? "#777"
              : "#111",
            color: "#fff",
            cursor: saving
              ? "default"
              : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {saving
            ? "⏳ Сохраняем..."
            : "💾 Сохранить изменения"}
        </button>

        {saved && (
          <span
            style={{
              color: "#287a35",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ✓ Сохранено
          </span>
        )}

        {error && (
          <span
            style={{
              color: "#991b1b",
              fontSize: 14,
            }}
          >
            {error}
          </span>
        )}
      </div>
    </div>
  );
}