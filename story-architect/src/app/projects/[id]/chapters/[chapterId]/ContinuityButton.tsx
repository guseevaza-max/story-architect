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

type Suggestion = {
  title: string;
  explanation: string;
  changes: string[];
  excerpt: string;
};

type SuggestionGroup = {
  issueId: string;
  problemTitle: string;
  suggestions: Suggestion[];
};

type Preview = {
  revisedDraft: string;
  changeSummary: string;
};

export default function ContinuityButton({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] =
    useState<ContinuityReport | null>(null);

  const [suggestionsLoading, setSuggestionsLoading] =
    useState(false);
  const [suggestionsLoaded, setSuggestionsLoaded] =
    useState(false);
  const [suggestionGroups, setSuggestionGroups] =
    useState<SuggestionGroup[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] =
    useState<Record<string, number>>({});

  const [revisionLoading, setRevisionLoading] =
    useState(false);
  const [preview, setPreview] =
    useState<Preview | null>(null);

  async function handleCheck() {
    setLoading(true);
    setError("");
    setReport(null);
    setSuggestionsLoaded(false);
    setSuggestionGroups([]);
    setSelectedSuggestions({});
    setPreview(null);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/continuity`,
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
    } catch (requestError) {
      console.error(requestError);
      setError("Ошибка соединения с сервером.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSuggestions() {
    if (!report || report.issues.length === 0) {
      return;
    }

    try {
      setSuggestionsLoading(true);
      setError("");
      setPreview(null);

      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/continuity/suggestions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      const responseText = await response.text();

      let data: any = null;

      try {
        data = responseText
          ? JSON.parse(responseText)
          : null;
      } catch {
        throw new Error(
          `API вернул не JSON. HTTP ${response.status}. Ответ: ${responseText.slice(
            0,
            300
          )}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Ошибка API. HTTP ${response.status}`
        );
      }

      const groups = Array.isArray(
        data?.suggestions
      )
        ? data.suggestions
        : [];

      setSuggestionGroups(groups);
      setSelectedSuggestions({});
      setSuggestionsLoaded(true);
    } catch (requestError) {
      console.error(requestError);

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось получить предложения AI."
      );
    } finally {
      setSuggestionsLoading(false);
    }
  }

  function selectSuggestion(
    issueId: string,
    suggestionIndex: number
  ) {
    setSelectedSuggestions((current) => ({
      ...current,
      [issueId]: suggestionIndex,
    }));

    setPreview(null);
    setError("");
  }

  async function prepareCombinedRevision() {
    if (!report) {
      return;
    }

    const selections = report.issues
      .map((issue, index) => {
        const issueId =
          issue.id ?? String(index);

        const suggestionIndex =
          selectedSuggestions[issueId];

        const group = suggestionGroups.find(
          (item) => item.issueId === issueId
        );

        if (
          suggestionIndex === undefined ||
          !group?.suggestions[suggestionIndex]
        ) {
          return null;
        }

        return {
          issueId,
          problemTitle:
            group.problemTitle ||
            issue.title ||
            "Проблема",
          suggestion:
            group.suggestions[
              suggestionIndex
            ],
        };
      })
      .filter(Boolean);

    if (selections.length === 0) {
      setError(
        "Сначала выбери хотя бы одно предложение исправления."
      );
      return;
    }

    try {
      setRevisionLoading(true);
      setError("");
      setPreview(null);

      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/continuity/apply-suggestions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selections,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Не удалось подготовить общее исправление."
        );
      }

      setPreview({
        revisedDraft: data.revisedDraft,
        changeSummary: data.changeSummary,
      });
    } catch (requestError) {
      console.error(requestError);

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось подготовить общее исправление."
      );
    } finally {
      setRevisionLoading(false);
    }
  }

  async function acceptCombinedRevision() {
    if (!preview?.revisedDraft?.trim()) {
      return;
    }

    try {
      setRevisionLoading(true);
      setError("");

      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draftText: preview.revisedDraft,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Не удалось сохранить исправленный черновик."
        );
      }

      window.location.reload();
    } catch (requestError) {
      console.error(requestError);

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось сохранить исправленный черновик."
      );
    } finally {
      setRevisionLoading(false);
    }
  }

  function cancelPreview() {
    setPreview(null);
    setError("");
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
        background: "#e8f5e9",
        color: "#287a35",
        border: "#a5d6a7",
      };
    }

    if (status === "WARN") {
      return {
        background: "#fff8e1",
        color: "#8a6500",
        border: "#ffe082",
      };
    }

    return {
      background: "#ffebee",
      color: "#b71c1c",
      border: "#ef9a9a",
    };
  }

  function readJsonText(value: unknown): string {
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
      return JSON.stringify(
        value,
        null,
        2
      ) ?? "";
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
      typeof issue.explanations === "object" &&
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

  const selectedCount =
    Object.keys(selectedSuggestions).length;

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
            ? "#777"
            : "#315a7d",
          color: "#fff",
          cursor: loading
            ? "default"
            : "pointer",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {loading
          ? "⏳ Проверяем главу..."
          : "🔎 Проверить непрерывность"}
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

      {report && (
        <div
          style={{
            marginTop: 16,
            border: "1px solid #d8dee6",
            borderRadius: 10,
            background: "#fff",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 18,
              borderBottom:
                "1px solid #e5e7eb",
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
              <strong style={{ fontSize: 16 }}>
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
                color: "#444",
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
                color: "#287a35",
                background: "#f7fcf7",
                fontWeight: 600,
              }}
            >
              ✓ Проверка завершена.
              Существенных проблем не
              обнаружено.
            </div>
          ) : (
            <div style={{ padding: 18 }}>
              <div
                style={{
                  marginBottom: 14,
                  fontWeight: 700,
                  color: "#333",
                }}
              >
                Найдено проблем:{" "}
                {report.issues.length}
              </div>

              {!suggestionsLoaded && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: 12,
                    borderRadius: 8,
                    background: "#f3f7fb",
                    color: "#315a7d",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  💡 Для любой найденной проблемы
                  можно запросить варианты
                  исправления. Они появятся прямо
                  под соответствующей проблемой.
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {report.issues.map(
                  (issue, index) => {
                    const issueId =
                      issue.id ??
                      String(index);

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
                              "#ffebee",
                            color:
                              "#b71c1c",
                          }
                        : severityText ===
                          "MEDIUM"
                        ? {
                            background:
                              "#fff8e1",
                            color:
                              "#8a6500",
                          }
                        : {
                            background:
                              "#f5f5f5",
                            color:
                              "#666",
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

                    const group =
                      suggestionGroups.find(
                        (item) =>
                          item.issueId ===
                          issueId
                      );

                    const selectedIndex =
                      selectedSuggestions[
                        issueId
                      ];

                    return (
                      <div
                        key={
                          issue.id ??
                          `${index}-issue`
                        }
                        style={{
                          border:
                            "1px solid #ddd",
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
                              color: "#333",
                              lineHeight: 1.5,
                            }}
                          >
                            {index + 1}.{" "}
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
                                "#777",
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
                                "#555",
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
                                  "#f7f7f7",
                                fontSize: 13,
                                lineHeight:
                                  1.5,
                                color:
                                  "#555",
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
                                "#f3f7fb",
                              fontSize: 13,
                              lineHeight:
                                1.5,
                              color:
                                "#315a7d",
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
                                  "#f7f7f7",
                                fontSize: 12,
                                color:
                                  "#666",
                                whiteSpace:
                                  "pre-wrap",
                              }}
                            >
                              {readJsonText(
                                explanation
                              )}
                            </div>
                          )}

                        <div
                          style={{
                            marginTop: 14,
                            paddingTop: 14,
                            borderTop:
                              "1px solid #eee",
                          }}
                        >
                          {!suggestionsLoaded ? (
                            <button
                              type="button"
                              onClick={
                                loadSuggestions
                              }
                              disabled={
                                suggestionsLoading ||
                                revisionLoading
                              }
                              style={{
                                padding:
                                  "9px 13px",
                                borderRadius: 7,
                                border:
                                  "1px solid #315a7d",
                                background:
                                  "#f3f7fb",
                                color:
                                  "#315a7d",
                                cursor:
                                  suggestionsLoading ||
                                  revisionLoading
                                    ? "default"
                                    : "pointer",
                                fontWeight: 600,
                              }}
                            >
                              {suggestionsLoading
                                ? "⏳ AI готовит варианты..."
                                : "💡 Предложить исправление"}
                            </button>
                          ) : group &&
                            group.suggestions
                              .length > 0 ? (
                            <div>
                              <div
                                style={{
                                  marginBottom:
                                    10,
                                  fontWeight: 700,
                                  color:
                                    "#315a7d",
                                }}
                              >
                                💡 Варианты
                                исправления
                              </div>

                              {group.suggestions.map(
                                (
                                  suggestion,
                                  suggestionIndex
                                ) => {
                                  const selected =
                                    selectedIndex ===
                                    suggestionIndex;

                                  return (
                                    <button
                                      key={
                                        suggestionIndex
                                      }
                                      type="button"
                                      onClick={() =>
                                        selectSuggestion(
                                          issueId,
                                          suggestionIndex
                                        )
                                      }
                                      disabled={
                                        revisionLoading
                                      }
                                      style={{
                                        display:
                                          "block",
                                        width:
                                          "100%",
                                        textAlign:
                                          "left",
                                        marginBottom:
                                          8,
                                        padding:
                                          12,
                                        borderRadius:
                                          8,
                                        border:
                                          selected
                                            ? "2px solid #166534"
                                            : "1px solid #ddd",
                                        background:
                                          selected
                                            ? "#f0fdf4"
                                            : "#fff",
                                        cursor:
                                          revisionLoading
                                            ? "default"
                                            : "pointer",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display:
                                            "flex",
                                          gap: 8,
                                          alignItems:
                                            "center",
                                          marginBottom:
                                            6,
                                        }}
                                      >
                                        <span
                                          style={{
                                            width:
                                              22,
                                            height:
                                              22,
                                            borderRadius:
                                              "50%",
                                            display:
                                              "inline-flex",
                                            alignItems:
                                              "center",
                                            justifyContent:
                                              "center",
                                            background:
                                              selected
                                                ? "#166534"
                                                : "#eee",
                                            color:
                                              selected
                                                ? "#fff"
                                                : "#555",
                                            fontSize:
                                              12,
                                            fontWeight:
                                              700,
                                          }}
                                        >
                                          {selected
                                            ? "✓"
                                            : suggestionIndex +
                                              1}
                                        </span>

                                        <strong>
                                          {
                                            suggestion.title
                                          }
                                        </strong>
                                      </div>

                                      <div
                                        style={{
                                          marginLeft:
                                            30,
                                          color:
                                            "#555",
                                          fontSize:
                                            13,
                                          lineHeight:
                                            1.5,
                                        }}
                                      >
                                        {
                                          suggestion.explanation
                                        }
                                      </div>

                                      {suggestion.changes
                                        ?.length >
                                        0 && (
                                        <ul
                                          style={{
                                            margin:
                                              "8px 0 0 46px",
                                            padding: 0,
                                            color:
                                              "#555",
                                            fontSize:
                                              12,
                                          }}
                                        >
                                          {suggestion.changes.map(
                                            (
                                              change,
                                              changeIndex
                                            ) => (
                                              <li
                                                key={
                                                  changeIndex
                                                }
                                                style={{
                                                  marginBottom:
                                                    3,
                                                }}
                                              >
                                                {
                                                  change
                                                }
                                              </li>
                                            )
                                          )}
                                        </ul>
                                      )}

                                      {suggestion.excerpt && (
                                        <div
                                          style={{
                                            marginTop:
                                              8,
                                            marginLeft:
                                              30,
                                            padding:
                                              8,
                                            borderRadius:
                                              6,
                                            background:
                                              "#f7f7f7",
                                            color:
                                              "#555",
                                            fontSize:
                                              12,
                                            fontStyle:
                                              "italic",
                                          }}
                                        >
                                          «
                                          {
                                            suggestion.excerpt
                                          }
                                          »
                                        </div>
                                      )}
                                    </button>
                                  );
                                }
                              )}
                            </div>
                          ) : (
                            <div
                              style={{
                                padding: 10,
                                borderRadius: 7,
                                background:
                                  "#f8fafc",
                                color: "#666",
                                fontSize: 13,
                              }}
                            >
                              AI не предложил
                              отдельного варианта
                              для этой проблемы.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>

              {suggestionsLoaded &&
                selectedCount > 0 && (
                  <div
                    style={{
                      marginTop: 18,
                      padding: 18,
                      borderRadius: 10,
                      background: "#f7fff8",
                      border:
                        "2px solid #b8d8bf",
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 8px",
                      }}
                    >
                      🛠 Общее исправление
                    </h4>

                    <p
                      style={{
                        margin:
                          "0 0 14px",
                        color: "#666",
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      Выбранные варианты будут
                      применены AI одновременно.
                      Сначала появится
                      предпросмотр — исходный
                      черновик не изменится.
                    </p>

                    <button
                      type="button"
                      onClick={
                        prepareCombinedRevision
                      }
                      disabled={
                        revisionLoading
                      }
                      style={{
                        padding:
                          "11px 18px",
                        borderRadius: 8,
                        border: "none",
                        background:
                          revisionLoading
                            ? "#aaa"
                            : "#166534",
                        color: "#fff",
                        cursor:
                          revisionLoading
                            ? "default"
                            : "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {revisionLoading
                        ? "⏳ AI готовит исправление..."
                        : `✏️ Подготовить общее исправление (${selectedCount})`}
                    </button>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {preview && (
        <section
          style={{
            marginTop: 20,
            padding: 18,
            borderRadius: 10,
            border:
              "2px solid #9bb7d4",
            background: "#f8fbff",
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            👀 Предпросмотр исправления
          </h3>

          <div
            style={{
              marginBottom: 16,
              padding: 14,
              borderRadius: 8,
              background: "#fff",
              border: "1px solid #ddd",
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
              maxHeight: 600,
              overflowY: "auto",
            }}
          >
            {preview.revisedDraft}
          </div>

          <div
            style={{
              marginBottom: 18,
              padding: 14,
              borderRadius: 8,
              background: "#f3f3f3",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <strong>Что изменилось:</strong>

            <div style={{ marginTop: 6 }}>
              {preview.changeSummary}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={
                acceptCombinedRevision
              }
              disabled={revisionLoading}
              style={{
                padding: "11px 18px",
                borderRadius: 8,
                border: "none",
                background:
                  revisionLoading
                    ? "#aaa"
                    : "#166534",
                color: "#fff",
                cursor:
                  revisionLoading
                    ? "default"
                    : "pointer",
                fontWeight: 600,
              }}
            >
              {revisionLoading
                ? "⏳ Сохраняем..."
                : "✓ Принять исправление"}
            </button>

            <button
              type="button"
              onClick={cancelPreview}
              disabled={revisionLoading}
              style={{
                padding: "11px 18px",
                borderRadius: 8,
                border:
                  "1px solid #ccc",
                background: "#fff",
                color: "#222",
                cursor:
                  revisionLoading
                    ? "default"
                    : "pointer",
              }}
            >
              Отменить
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
