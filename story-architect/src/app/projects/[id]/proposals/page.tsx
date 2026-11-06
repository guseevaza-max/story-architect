"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProposalCard, type Proposal } from "@/components/proposals/ProposalCard";
import {
  DECISION_VIEWS,
  countByView,
  decisionTitle,
  entityLabel,
  entityTypes,
  filterDecisions,
  statusLabel,
  type DecisionView,
} from "@/lib/ux/decisions";

export default function ProposalsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [proposals, setProposals] =
    useState<Proposal[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [processingId, setProcessingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState("");

  async function loadProposals() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/proposals?projectId=${projectId}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Не удалось загрузить предложения"
        );
      }

      setProposals(
        data.proposals || []
      );
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Ошибка загрузки предложений"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projectId) {
      loadProposals();
    }
  }, [projectId]);

  async function handleAction(
    proposalId: string,
    action: "ACCEPT" | "REJECT" | "EDIT_AND_ACCEPT",
    editedPayload?: unknown
  ) {
    try {
      setProcessingId(proposalId);
      setError("");

      const response = await fetch(
        `/api/proposals/${proposalId}/action`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action,
            ...(editedPayload !== undefined ? { editedPayload } : {}),
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Не удалось обработать предложение"
        );
      }

      await loadProposals();
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Ошибка обработки предложения"
      );
    } finally {
      setProcessingId(null);
    }
  }

  const pendingProposals =
    proposals.filter(
      (proposal) =>
        proposal.status ===
        "PENDING"
    );

  const [view, setView] = useState<DecisionView>("pending");
  const [typeFilter, setTypeFilter] = useState("");
  const counts = countByView(proposals);
  const shown = filterDecisions(proposals, view, typeFilter || null);

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 40,
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <div
        style={{
          marginBottom: 30,
        }}
      >
        <Link
          href={`/projects/${projectId}`}
        >
          ← Назад в проект
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 20,
          marginBottom: 30,
        }}
      >
        <div>
          <h1
            style={{
              marginBottom: 8,
            }}
          >
            Предложения AI
          </h1>

          <p
            style={{
              color: "var(--muted)",
              margin: 0,
            }}
          >
            Здесь AI предлагает
            изменения в Story
            Bible. Только автор
            решает, что становится
            Canon.
          </p>
        </div>

        <div
          style={{
            padding:
              "10px 16px",
            borderRadius: 20,
            background:
              "var(--surface-2)",
            fontWeight: 600,
          }}
        >
          {
            pendingProposals.length
          }{" "}
          ожидают решения
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            border:
              "1px solid var(--danger-border)",
            borderRadius: 8,
            background:
              "var(--danger-bg)",
          }}
        >
          <strong>
            Ошибка:
          </strong>{" "}
          {error}
        </div>
      )}

      {loading ? (
        <div>
          Загрузка
          предложений...
        </div>
      ) : proposals.length === 0 ? (
        <section
          style={{
            padding: 40,
            border:
              "1px solid var(--border)",
            borderRadius: 12,
            textAlign:
              "center",
          }}
        >
          <h2>
            Пока нет предложений
          </h2>

          <p
            style={{
              color: "var(--muted)",
            }}
          >
            Запустите AI-анализ
            в Story Bible, чтобы
            получить предложения.
          </p>

          <Link
            href={`/projects/${projectId}/story-bible`}
            style={{
              display:
                "inline-block",
              marginTop: 16,
              padding:
                "12px 20px",
              borderRadius: 8,
              background:
                "var(--primary)",
              color: "var(--on-primary)",
              textDecoration:
                "none",
            }}
          >
            Открыть Story Bible
          </Link>
        </section>
      ) : (
        <>
          <div
            role="tablist"
            style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 20 }}
          >
            {DECISION_VIEWS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={view === item.key}
                onClick={() => setView(item.key)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 20,
                  border: "1px solid var(--border)",
                  background: view === item.key ? "var(--primary)" : "var(--surface)",
                  color: view === item.key ? "var(--on-primary)" : "var(--text)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {item.label} · {counts[item.key]}
              </button>
            ))}
            <select
              aria-label="Тип"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              style={{ marginLeft: "auto", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}
            >
              <option value="">Все типы</option>
              {entityTypes(proposals).map((type) => (
                <option key={type} value={type}>
                  {entityLabel(type)}
                </option>
              ))}
            </select>
          </div>

          {shown.length === 0 ? (
            <section style={{ padding: 32, border: "1px solid var(--border)", borderRadius: 12, textAlign: "center", color: "var(--muted)" }}>
              В этом разделе пока пусто.
            </section>
          ) : view === "pending" ? (
            <div style={{ display: "grid", gap: 20 }}>
              {shown.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  processing={processingId === proposal.id}
                  onAction={handleAction}
                />
              ))}
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {shown.map((proposal) => (
                <li
                  key={proposal.id}
                  style={{ padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" }}
                >
                  <div style={{ fontWeight: 600 }}>{decisionTitle(proposal)}</div>
                  <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
                    {entityLabel(proposal.entityType)} · {statusLabel(proposal.status)} ·{" "}
                    {new Date(proposal.createdAt).toLocaleDateString("ru-RU")}
                  </div>
                  {proposal.reason && (
                    <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>{proposal.reason}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}