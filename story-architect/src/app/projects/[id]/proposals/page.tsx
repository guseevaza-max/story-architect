"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type ChapterPlan = {
  chapterPurpose?: string;
  initialState?: string;
  endState?: string;
  plotDevelopment?: string[];
  characterDevelopment?: string[];
  mustHappen?: string[];
  mustNotHappen?: string[];
  openQuestions?: string[];
};

type Proposal = {
  id: string;
  entityType: string;
  op: string;
  status: string;

  payload: {
    entityType?: string;

    data?: {
      name?: string;
      description?: string;
      role?: string;
      appearance?: string;
      history?: string;
      personality?: string;
      goals?: string;
      fears?: string;
      beliefs?: string;
      values?: string;
    };

    chapterPurpose?: string;
    initialState?: string;
    endState?: string;
    plotDevelopment?: string[];
    characterDevelopment?: string[];
    mustHappen?: string[];
    mustNotHappen?: string[];
    openQuestions?: string[];
  };

  reason: string | null;
  confidence: number | null;
  safety: string;
  createdAt: string;
};

export default function ProposalsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");

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
          data.error || "Не удалось загрузить предложения"
        );
      }

      setProposals(data.proposals || []);
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
    action: "ACCEPT" | "REJECT"
  ) {
    try {
      setProcessingId(proposalId);
      setError("");

      const response = await fetch(
        `/api/proposals/${proposalId}/action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Не удалось обработать предложение"
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

  const pendingProposals = proposals.filter(
    (proposal) => proposal.status === "PENDING"
  );

  function renderList(
    title: string,
    items: string[] | undefined,
    icon: string
  ) {
    if (!items || items.length === 0) {
      return null;
    }

    return (
      <div
        style={{
          marginTop: 20,
        }}
      >
        <h3
          style={{
            margin: "0 0 10px",
            fontSize: 16,
          }}
        >
          {icon} {title}
        </h3>

        <div
          style={{
            display: "grid",
            gap: 8,
          }}
        >
          {items.map((item, index) => (
            <div
              key={`${title}-${index}`}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "#f8f8f8",
                lineHeight: 1.5,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderChapterPlan(proposal: Proposal) {
    const plan: ChapterPlan = proposal.payload || {};

    return (
      <div>
        <div
          style={{
            padding: 18,
            borderRadius: 10,
            background: "#f7f7f7",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "#666",
              marginBottom: 8,
            }}
          >
            Предложение Architect
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 24,
            }}
          >
            План главы
          </h2>

          <p
            style={{
              margin: "8px 0 0",
              color: "#666",
            }}
          >
            AI подготовил структуру главы на основе идеи автора.
          </p>
        </div>

        {plan.chapterPurpose && (
          <div
            style={{
              padding: 18,
              borderRadius: 10,
              background: "#eef6ff",
              marginBottom: 16,
            }}
          >
            <h3
              style={{
                margin: "0 0 10px",
                fontSize: 16,
              }}
            >
              🎯 Цель главы
            </h3>

            <div
              style={{
                lineHeight: 1.6,
              }}
            >
              {plan.chapterPurpose}
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {plan.initialState && (
            <div
              style={{
                padding: 18,
                border: "1px solid #e5e5e5",
                borderRadius: 10,
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: 16,
                }}
              >
                🌅 Начальное состояние
              </h3>

              <div style={{ lineHeight: 1.6 }}>
                {plan.initialState}
              </div>
            </div>
          )}

          {plan.endState && (
            <div
              style={{
                padding: 18,
                border: "1px solid #e5e5e5",
                borderRadius: 10,
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: 16,
                }}
              >
                🏁 Конечное состояние
              </h3>

              <div style={{ lineHeight: 1.6 }}>
                {plan.endState}
              </div>
            </div>
          )}
        </div>

        {renderList(
          "Развитие сюжета",
          plan.plotDevelopment,
          "📖"
        )}

        {renderList(
          "Развитие персонажей",
          plan.characterDevelopment,
          "👤"
        )}

        {renderList(
          "Что должно произойти",
          plan.mustHappen,
          "✅"
        )}

        {renderList(
          "Чего не должно произойти",
          plan.mustNotHappen,
          "🚫"
        )}

        {renderList(
          "Открытые вопросы",
          plan.openQuestions,
          "❓"
        )}
      </div>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 40,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ marginBottom: 30 }}>
        <Link href={`/projects/${projectId}`}>
          ← Назад в проект
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 20,
          marginBottom: 30,
        }}
      >
        <div>
          <h1 style={{ marginBottom: 8 }}>
            Предложения AI
          </h1>

          <p
            style={{
              color: "#666",
              margin: 0,
            }}
          >
            Здесь AI предлагает изменения в Story Bible.
            Только автор решает, что становится Canon.
          </p>
        </div>

        <div
          style={{
            padding: "10px 16px",
            borderRadius: 20,
            background: "#f3f4f6",
            fontWeight: 600,
          }}
        >
          {pendingProposals.length} ожидают решения
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            border: "1px solid #cc0000",
            borderRadius: 8,
            background: "#fff5f5",
          }}
        >
          <strong>Ошибка:</strong> {error}
        </div>
      )}

      {loading ? (
        <div>Загрузка предложений...</div>
      ) : pendingProposals.length === 0 ? (
        <section
          style={{
            padding: 40,
            border: "1px solid #ddd",
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          <h2>Пока нет предложений</h2>

          <p style={{ color: "#666" }}>
            Запустите AI-анализ в Story Bible, чтобы получить
            предложения.
          </p>

          <Link
            href={`/projects/${projectId}/story-bible`}
            style={{
              display: "inline-block",
              marginTop: 16,
              padding: "12px 20px",
              borderRadius: 8,
              background: "#111",
              color: "#fff",
              textDecoration: "none",
            }}
          >
            Открыть Story Bible
          </Link>
        </section>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 20,
          }}
        >
          {pendingProposals.map((proposal) => {
            const data = proposal.payload?.data || {};
            const isChapterPlan =
              proposal.entityType === "chapter_plan";

            const isProcessing =
              processingId === proposal.id;

            return (
              <section
                key={proposal.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 14,
                  padding: 24,
                  background: "#fff",
                }}
              >
                {isChapterPlan ? (
                  renderChapterPlan(proposal)
                ) : (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 20,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#666",
                          marginBottom: 8,
                        }}
                      >
                        AI Proposal · {proposal.entityType}
                      </div>

                      <h2
                        style={{
                          margin: "0 0 12px",
                        }}
                      >
                        {data.name || "Без названия"}
                      </h2>

                      {data.description && (
                        <p
                          style={{
                            lineHeight: 1.6,
                            marginTop: 0,
                          }}
                        >
                          {data.description}
                        </p>
                      )}

                      {data.role && (
                        <p>
                          <strong>Роль:</strong> {data.role}
                        </p>
                      )}

                      {data.appearance && (
                        <p>
                          <strong>Внешность:</strong>{" "}
                          {data.appearance}
                        </p>
                      )}

                      {data.personality && (
                        <p>
                          <strong>Характер:</strong>{" "}
                          {data.personality}
                        </p>
                      )}

                      {data.goals && (
                        <p>
                          <strong>Цели:</strong> {data.goals}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {proposal.reason && (
                  <div
                    style={{
                      marginTop: 24,
                      padding: 14,
                      borderRadius: 8,
                      background: "#f7f7f7",
                      fontSize: 14,
                    }}
                  >
                    <strong>
                      Почему AI это предлагает:
                    </strong>

                    <br />

                    {proposal.reason}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 24,
                    paddingTop: 20,
                    borderTop: "1px solid #eee",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      padding: "6px 10px",
                      borderRadius: 20,
                      background: "#fff4cc",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    PENDING
                  </span>

                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                    }}
                  >
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() =>
                        handleAction(
                          proposal.id,
                          "ACCEPT"
                        )
                      }
                      style={{
                        padding: "11px 20px",
                        borderRadius: 8,
                        border: "none",
                        background: "#111",
                        color: "#fff",
                        cursor: isProcessing
                          ? "default"
                          : "pointer",
                        opacity: isProcessing ? 0.6 : 1,
                      }}
                    >
                      {isProcessing
  ? "Обработка..."
  : proposal.entityType === "scene_plan"
    ? "✓ Утвердить план сцен"
    : isChapterPlan
      ? "✓ Утвердить план главы"
      : "✓ Принять в Canon"}
                    </button>

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() =>
                        handleAction(
                          proposal.id,
                          "REJECT"
                        )
                      }
                      style={{
                        padding: "11px 20px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        background: "#fff",
                        cursor: isProcessing
                          ? "default"
                          : "pointer",
                        opacity: isProcessing ? 0.6 : 1,
                      }}
                    >
                      ✕ Отклонить
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}