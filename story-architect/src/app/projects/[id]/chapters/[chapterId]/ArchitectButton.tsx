"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ArchitectButton({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleRunArchitect() {
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/architect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Architect не смог выполнить анализ.");
        return;
      }

      const state = data.context?.storyState;

      setMessage(
        "Architect завершил анализ. Предложение создано и ожидает утверждения." +
          (state
            ? ` В контекст вошло: персонажей ${state.characters}, состояний ${state.states}, отношений ${state.relationships}.`
            : "")
      );

      router.refresh();
    } catch {
      setError("Не удалось связаться с Architect.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleRunArchitect}
        disabled={loading}
        style={{
          padding: "12px 18px",
          border: "none",
          borderRadius: 10,
          background: loading ? "var(--surface-3)" : "var(--primary)",
          color: "var(--on-primary)",
          fontSize: 15,
          fontWeight: 600,
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Architect анализирует..." : "🧠 Запустить Architect"}
      </button>

      {message && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 8,
            background: "var(--ok-bg)",
            color: "var(--ok-text)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {message}
          <div style={{ marginTop: 8 }}>
            <Link href={`/projects/${projectId}/proposals`} style={{ color: "var(--ok-text)", fontWeight: 600 }}>
              Открыть предложения и утвердить план →
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 8,
            background: "var(--danger-bg)",
            color: "var(--danger-text)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}