"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProposalCard, type Proposal, type ProposalActionName } from "./ProposalCard";

export type DecisionHistoryItem = {
  id: string;
  entityType: string;
  status: string;
  createdAt: string;
};

const KIND: Record<string, string> = { chapter_plan: "План главы", scene_plan: "План сцен" };
const RESULT: Record<string, string> = { ACCEPTED: "Принято", REJECTED: "Отклонено", SUPERSEDED: "Заменено новым" };

/**
 * Решения по плану главы и сценам прямо на вкладке «Планирование».
 * Решение уходит тем же маршрутом, что и в Центре решений:
 * POST /api/proposals/[id]/action (там applyProposal). Автоматически ничего не принимается.
 */
export default function ChapterDecisions({
  projectId,
  pending,
  history,
}: {
  projectId: string;
  pending: Proposal[];
  history: DecisionHistoryItem[];
}) {
  const router = useRouter();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleAction(proposalId: string, action: ProposalActionName, editedPayload?: unknown) {
    try {
      setProcessingId(proposalId);
      setError("");
      const response = await fetch(`/api/proposals/${proposalId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(editedPayload !== undefined ? { editedPayload } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось обработать предложение");
      router.refresh();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Ошибка обработки предложения");
    } finally {
      setProcessingId(null);
    }
  }

  if (pending.length === 0 && history.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {pending.length > 0 && (
        <section style={{ border: "1px solid var(--warn-border)", background: "var(--warn-bg)", borderRadius: 14, padding: 16 }}>
          <strong>Ждут вашего решения: {pending.length}</strong>
          <p style={{ margin: "6px 0 0", color: "var(--warn-text)" }}>
            Автоматически ничего не принимается: проверьте и решите сами. <Link href={`/projects/${projectId}/proposals`}>Все предложения проекта →</Link>
          </p>
        </section>
      )}
      {error && (
        <div role="alert" style={{ padding: 12, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger-text)" }}>
          {error}
        </div>
      )}
      {pending.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} processing={processingId === proposal.id} onAction={handleAction} />
      ))}
      {history.length > 0 && (
        <details style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "12px 16px", background: "var(--surface)" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>История решений ({history.length})</summary>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--text-2)", lineHeight: 1.7 }}>
            {history.map((item) => (
              <li key={item.id}>
                {KIND[item.entityType] ?? item.entityType} — {RESULT[item.status] ?? item.status},{" "}
                {new Date(item.createdAt).toLocaleDateString("ru-RU")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
