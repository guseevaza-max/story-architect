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