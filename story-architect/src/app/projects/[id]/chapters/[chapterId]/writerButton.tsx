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

  async function handleGenerate() {
    setLoading(true);
    setError("");

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
            ? "#777"
            : "#111",
          color: "#fff",
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

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: "#fee2e2",
            color: "#991b1b",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}