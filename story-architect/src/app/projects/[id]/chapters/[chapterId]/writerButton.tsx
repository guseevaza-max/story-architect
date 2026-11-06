"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WriterButton({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setNotes("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/writer`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Не удалось создать черновик главы."
        );
        return;
      }

      // Конфликт замысла с Canon: текст главы по Canon, замечания отдельно.
      setNotes(typeof data.authorNotes === "string" ? data.authorNotes : "");

      router.refresh();
    } catch (error) {
      console.error(error);

      setError(
        "Ошибка соединения с сервером."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        style={{
          padding: "11px 18px",
          borderRadius: 8,
          border: "none",
          background: loading
            ? "var(--surface-3)"
            : "var(--primary)",
          color: "var(--on-primary)",
          cursor: loading
            ? "default"
            : "pointer",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {loading
          ? "⏳ Writer пишет главу..."
          : "✍️ Сгенерировать черновик"}
      </button>

      {notes && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: "var(--warn-bg)",
            color: "var(--warn-text)",
            lineHeight: 1.5,
          }}
        >
          <strong>Замечания Writer по замыслу:</strong>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{notes}</div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: "var(--danger-bg)",
            color: "var(--danger-text)",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}