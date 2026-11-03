"use client";

import Link from "next/link";
import { useState } from "react";

type SkippedFact = { statement: string; reason: string };

type Result = {
  created: number;
  skipped: SkippedFact[];
  truncated: boolean;
  invalidItems: number;
};

const REASONS: Record<string, string> = {
  empty_statement: "пустое утверждение",
  quote_not_found: "цитата не найдена в тексте",
  duplicate_in_response: "повтор в ответе AI",
  duplicate_pending: "уже ждёт вашего решения",
  previously_rejected: "ранее отклонено вами",
  already_canon: "уже есть в Canon",
  limit_exceeded: "превышен лимит фактов",
  low_confidence: "низкая уверенность (гипотеза)",
  hedged: "предположение, а не факт",
};

/**
 * Кнопка «Извлечь факты» для материала Lore Library.
 * Факты попадают в очередь предложений, Canon не изменяется.
 */
export default function ExtractFactsButton({
  projectId,
  materialId,
}: {
  projectId: string;
  materialId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function extract() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/lore/${materialId}/extract`,
        { method: "POST" }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Не удалось извлечь факты.");
      }

      setResult({
        created: Number(data.created ?? 0),
        skipped: Array.isArray(data.skipped) ? data.skipped : [],
        truncated: Boolean(data.truncated),
        invalidItems: Number(data.invalidItems ?? 0),
      });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Не удалось извлечь факты."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "inline-block", verticalAlign: "top" }}>
      <button type="button" onClick={() => void extract()} disabled={loading}>
        {loading ? "Извлечение…" : "Извлечь факты"}
      </button>

      {error && (
        <div style={{ color: "#991b1b", marginTop: 8, maxWidth: 420 }}>
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 8, maxWidth: 420, lineHeight: 1.5, fontSize: 14 }}>
          <strong>Предложено фактов: {result.created}</strong>{" "}
          {result.created > 0 && (
            <Link href={`/projects/${projectId}/proposals`}>К предложениям →</Link>
          )}

          {result.truncated && (
            <div style={{ color: "#8a5a00" }}>
              Материал длинный: обработано только начало текста.
            </div>
          )}

          {result.skipped.length > 0 && (
            <details>
              <summary>Пропущено: {result.skipped.length}</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {result.skipped.map((item, index) => (
                  <li key={index}>
                    {item.statement || "(без текста)"} —{" "}
                    {REASONS[item.reason] ?? item.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
