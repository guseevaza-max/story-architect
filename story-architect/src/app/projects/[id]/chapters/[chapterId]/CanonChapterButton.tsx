"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { useRouter } from "next/navigation";

export default function CanonChapterButton({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAddToCanon() {
    const confirmed = window.confirm(
      "Добавить утверждённую главу в Canon?\n\nПосле этого глава станет частью подтверждённой истории."
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
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
            status: "CANON",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Не удалось добавить главу в Canon."
        );
        return;
      }

      toast.success("Глава переведена в Canon");
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
      <button
        type="button"
        onClick={handleAddToCanon}
        disabled={saving}
        style={{
          padding: "12px 20px",
          borderRadius: 8,
          border: "none",
          background: saving
            ? "var(--surface-3)"
            : "var(--violet-solid)",
          color: "var(--on-primary)",
          cursor: saving
            ? "default"
            : "pointer",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {saving
          ? "⏳ Добавляем..."
          : "📚 Добавить в Canon"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 10,
            color: "var(--danger-text)",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}