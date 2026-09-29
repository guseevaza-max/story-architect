"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MemoryUpdateButton({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function handleMemoryUpdate() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/memory`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Не удалось выполнить Memory Update."
        );
        return;
      }

      setResult(data);
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
        onClick={handleMemoryUpdate}
        disabled={loading}
        style={{
          padding: "12px 20px",
          borderRadius: 8,
          border: "none",
          background: loading
            ? "#777"
            : "#2563eb",
          color: "#fff",
          cursor: loading
            ? "default"
            : "pointer",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {loading
          ? "⏳ Анализируем память..."
          : "🧠 Обновить Memory"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: "#fff1f2",
            color: "#991b1b",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#f8fafc",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: 12,
            }}
          >
            🧠 Memory Extraction готов
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(4, minmax(100px, 1fr))",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div>
              <strong>
                {result.summary?.total ?? 0}
              </strong>
              <div>Всего</div>
            </div>

            <div>
              <strong>
                {result.summary?.safe ?? 0}
              </strong>
              <div>Безопасных</div>
            </div>

            <div>
              <strong>
                {result.summary?.uncertain ?? 0}
              </strong>
              <div>Неопределённых</div>
            </div>

            <div>
              <strong>
                {result.summary?.conflicts ?? 0}
              </strong>
              <div>Конфликтов</div>
            </div>
          </div>

          {result.summary?.shortSummary && (
            <div
              style={{
                marginBottom: 12,
              }}
            >
              <strong>
                Краткое резюме
              </strong>

              <p
                style={{
                  marginBottom: 0,
                  lineHeight: 1.5,
                }}
              >
                {result.summary.shortSummary}
              </p>
            </div>
          )}

          <div
            style={{
              fontSize: 13,
              color: "#666",
            }}
          >
            Proposal создан:{" "}
            <strong>
              {result.proposal?.status}
            </strong>
            {" · "}
            Safety:{" "}
            <strong>
              {result.proposal?.safety}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}