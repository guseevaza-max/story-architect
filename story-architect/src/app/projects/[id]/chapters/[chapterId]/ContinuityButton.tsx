"use client";

import { useState } from "react";

type ContinuityIssue = {
  id?: string;
  severity?: "HIGH" | "MEDIUM" | "LOW";
  alertType?: "ERROR" | "WARNING" | "OPPORTUNITY";
  priority?:
    | "CRITICAL"
    | "IMPORTANT"
    | "USEFUL"
    | "OPTIONAL";

  category?: string;
  title?: string;

  evidence?: unknown;
  explanations?: unknown;

  confidence?: number | null;
  suggestedResolutions?: unknown;

  resolved?: boolean;
  resolution?: string | null;
};

type ContinuityReport = {
  id?: string;
  status: "PASS" | "WARN" | "FAIL";
  summary: string;
  issues: ContinuityIssue[];
};

export default function ContinuityButton({
  projectId,
  chapterId,
  mode = "draft",
}: {
  projectId: string;
  chapterId: string;
  /** draft — проверка готового текста; plan — проверка плана и сцен до написания. */
  mode?: "draft" | "plan";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] =
    useState<ContinuityReport | null>(null);

  async function handleCheck() {
    setLoading(true);
    setError("");
    setReport(null);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/continuity${mode === "plan" ? "/plan" : ""}`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.details
            ? `${String(data.error ?? "Ошибка")}: ${String(
                data.details
              )}`
            : String(
                data.error ??
                  "Не удалось выполнить проверку."
              )
        );

        return;
      }

      if (data.report) {
        setReport(
          data.report as ContinuityReport
        );
      } else {
        setError(
          "Проверка завершилась, но отчёт не был получен."
        );
      }
    } catch (error) {
      console.error(error);

      setError(
        "Ошибка соединения с сервером."
      );
    } finally {
      setLoading(false);
    }
  }

  function getStatusLabel(
    status: ContinuityReport["status"]
  ): string {
    if (status === "PASS") {
      return "✓ Противоречий не найдено";
    }

    if (status === "WARN") {
      return "⚠ Есть предупреждения";
    }

    return "🔴 Обнаружены проблемы";
  }

  function getStatusStyle(
    status: ContinuityReport["status"]
  ): {
    background: string;
    color: string;
    border: string;
  } {
    if (status === "PASS") {
      return {
        background: "var(--ok-bg)",
        color: "var(--ok-text)",
        border: "var(--ok-border)",
      };
    }

    if (status === "WARN") {
      return {
        background: "var(--warn-bg)",
        color: "var(--warn-text)",
        border: "var(--warn-border)",
      };
    }

    return {
      background: "var(--danger-bg)",
      color: "var(--danger-text)",
      border: "var(--danger-border)",
    };
  }

  function readJsonText(
    value: unknown
  ): string {
    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    if (
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return String(value);
    }

    try {
      const json = JSON.stringify(
        value,
        null,
        2
      );

      return json ?? "";
    } catch {
      return String(value);
    }
  }

  function getExplanation(
    issue: ContinuityIssue
  ): Record<string, unknown> | null {
    if (
      issue.explanations !== null &&
      issue.explanations !== undefined &&
      typeof issue.explanations ===
        "object" &&
      !Array.isArray(
        issue.explanations
      )
    ) {
      return issue.explanations as Record<
        string,
        unknown
      >;
    }

    return null;
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleCheck}
        disabled={loading}
        style={{
          padding: "11px 18px",
          borderRadius: 8,
          border: "none",
          background: loading
            ? "var(--surface-3)"
            : "var(--info-solid)",
          color: "var(--on-primary)",
          cursor: loading
            ? "default"
            : "pointer",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {loading
          ? mode === "plan"
            ? "⏳ Проверяем план..."
            : "⏳ Проверяем главу..."
          : mode === "plan"
            ? "🔎 Проверить план и сцены"
            : "🔎 Проверить непрерывность"}
      </button>

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

      {report && (
        <div
          style={{
            marginTop: 16,
            border: "1px solid var(--info-border)",
            borderRadius: 10,
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 18,
              borderBottom:
                "1px solid var(--border-soft)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <strong
                style={{
                  fontSize: 16,
                }}
              >
                🔍 Результат проверки
              </strong>

              {(() => {
                const statusStyle =
                  getStatusStyle(
                    report.status
                  );

                return (
                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      border: `1px solid ${statusStyle.border}`,
                      background:
                        statusStyle.background,
                      color:
                        statusStyle.color,
                    }}
                  >
                    {getStatusLabel(
                      report.status
                    )}
                  </span>
                );
              })()}
            </div>

            <p
              style={{
                margin: "12px 0 0",
                color: "var(--text-2)",
                lineHeight: 1.6,
              }}
            >
              {String(
                report.summary ?? ""
              )}
            </p>
          </div>

          {report.issues.length === 0 ? (
            <div
              style={{
                padding: 18,
                color: "var(--ok-text)",
                background: "var(--ok-bg)",
                fontWeight: 600,
              }}
            >
              ✓ Проверка завершена.
              Существенных проблем не
              обнаружено.
            </div>
          ) : (
            <div
              style={{
                padding: 18,
              }}
            >
              <div
                style={{
                  marginBottom: 14,
                  fontWeight: 700,
                  color: "var(--text)",
                }}
              >
                Найдено проблем:{" "}
                {String(
                  report.issues.length
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {report.issues.map(
                  (issue, index) => {
                    const severityValue =
                      issue.severity ??
                      (issue.alertType ===
                      "ERROR"
                        ? "HIGH"
                        : issue.alertType ===
                          "WARNING"
                        ? "MEDIUM"
                        : "LOW");

                    const severityText =
                      String(
                        severityValue
                      );

                    const severityStyle =
                      severityText === "HIGH"
                        ? {
                            background:
                              "var(--danger-bg)",
                            color:
                              "var(--danger-text)",
                          }
                        : severityText ===
                          "MEDIUM"
                        ? {
                            background:
                              "var(--warn-bg)",
                            color:
                              "var(--warn-text)",
                          }
                        : {
                            background:
                              "var(--surface-2)",
                            color:
                              "var(--muted)",
                          };

                    const categoryText =
                      issue.category
                        ? String(
                            issue.category
                          )
                        : "";

                    const titleText =
                      issue.title
                        ? String(
                            issue.title
                          )
                        : "Проблема";

                    const explanation =
                      getExplanation(
                        issue
                      );

                    const locationValue =
                      explanation?.[
                        "location"
                      ];

                    const recommendationValue =
                      explanation?.[
                        "recommendation"
                      ];

                    const locationText =
                      locationValue !==
                        null &&
                      locationValue !==
                        undefined
                        ? String(
                            locationValue
                          )
                        : "";

                    const recommendationText =
                      recommendationValue !==
                        null &&
                      recommendationValue !==
                        undefined
                        ? String(
                            recommendationValue
                          )
                        : "";

                    return (
                      <div
                        key={
                          issue.id ??
                          `${index}-${categoryText || "issue"}`
                        }
                        style={{
                          border:
                            "1px solid var(--border)",
                          borderRadius: 9,
                          padding: 16,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent:
                              "space-between",
                            alignItems:
                              "flex-start",
                            gap: 12,
                          }}
                        >
                          <strong
                            style={{
                              color: "var(--text)",
                              lineHeight: 1.5,
                            }}
                          >
                            {String(
                              index + 1
                            )}
                            .{" "}
                            {titleText}
                          </strong>

                          <span
                            style={{
                              flexShrink: 0,
                              padding:
                                "4px 8px",
                              borderRadius:
                                999,
                              fontSize: 11,
                              fontWeight: 700,
                              background:
                                severityStyle.background,
                              color:
                                severityStyle.color,
                            }}
                          >
                            {severityText}
                          </span>
                        </div>

                        {categoryText && (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              color:
                                "var(--muted)",
                            }}
                          >
                            Тип:{" "}
                            {categoryText}
                          </div>
                        )}

                        {locationText && (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 13,
                              color:
                                "var(--text-2)",
                            }}
                          >
                            📍{" "}
                            {locationText}
                          </div>
                        )}

                        {issue.evidence !==
                          null &&
                          issue.evidence !==
                            undefined && (
                            <div
                              style={{
                                marginTop: 10,
                                padding: 10,
                                borderRadius:
                                  7,
                                background:
                                  "var(--surface-2)",
                                fontSize: 13,
                                lineHeight:
                                  1.5,
                                color:
                                  "var(--text-2)",
                              }}
                            >
                              <strong>
                                Основание:
                              </strong>

                              <div
                                style={{
                                  marginTop: 5,
                                  whiteSpace:
                                    "pre-wrap",
                                }}
                              >
                                {readJsonText(
                                  issue.evidence
                                )}
                              </div>
                            </div>
                          )}

                        {recommendationText && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: 10,
                              borderRadius:
                                7,
                              background:
                                "var(--info-bg)",
                              fontSize: 13,
                              lineHeight:
                                1.5,
                              color:
                                "var(--info-text)",
                            }}
                          >
                            <strong>
                              💡 Рекомендация:
                            </strong>

                            <div
                              style={{
                                marginTop: 5,
                              }}
                            >
                              {
                                recommendationText
                              }
                            </div>
                          </div>
                        )}

                        {!locationText &&
                          !recommendationText &&
                          explanation && (
                            <div
                              style={{
                                marginTop: 10,
                                padding: 10,
                                borderRadius:
                                  7,
                                background:
                                  "var(--surface-2)",
                                fontSize: 12,
                                color:
                                  "var(--muted)",
                                whiteSpace:
                                  "pre-wrap",
                              }}
                            >
                              {readJsonText(
                                explanation
                              )}
                            </div>
                          )}
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}