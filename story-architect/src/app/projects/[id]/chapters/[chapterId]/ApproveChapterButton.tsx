"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { useRouter } from "next/navigation";

export default function ApproveChapterButton({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  async function handleApprove() {
    const confirmed = window.confirm(
      "Утвердить эту главу?\n\nПосле утверждения глава получит статус «Утверждена». Canon пока не изменяется."
    );

    if (!confirmed) {
      return;
    }

    setApproving(true);
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
            status: "APPROVED",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Не удалось утвердить главу."
        );
        return;
      }

      toast.success("Глава утверждена");
      router.refresh();
    } catch (error) {
      console.error(error);

      setError(
        "Ошибка соединения с сервером."
      );
    } finally {
      setApproving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleApprove}
        disabled={approving}
        style={{
          padding: "12px 20px",
          borderRadius: 8,
          border: "none",
          background: approving
            ? "var(--surface-3)"
            : "var(--ok-solid)",
          color: "var(--on-primary)",
          cursor: approving
            ? "default"
            : "pointer",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {approving
          ? "⏳ Утверждаем..."
          : "✓ Утвердить главу"}
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