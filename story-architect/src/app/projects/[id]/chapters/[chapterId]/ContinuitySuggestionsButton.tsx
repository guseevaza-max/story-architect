"use client";

import { useState } from "react";

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

type Props = {
  projectId: string;
  chapterId: string;
};

export default function ContinuitySuggestionsButton({
  projectId,
  chapterId,
}: Props) {
  const [groups, setGroups] =
    useState<SuggestionGroup[]>([]);

  const [selected, setSelected] =
    useState<Record<string, number>>({});

  const [loading, setLoading] =
    useState(false);

  const [applying, setApplying] =
    useState(false);

  const [error, setError] =
    useState("");

  const [preview, setPreview] =
    useState<{
      revisedDraft: string;
      changeSummary: string;
    } | null>(null);

  async function loadSuggestions() {
    try {
      setLoading(true);
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

      const responseText =
        await response.text();

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

      const nextGroups =
        Array.isArray(data.suggestions)
          ? data.suggestions
          : [];

      setGroups(nextGroups);
      setSelected({});
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Не удалось получить предложения AI."
      );
    } finally {
      setLoading(false);
    }
  }

  function selectSuggestion(
    issueId: string,
    suggestionIndex: number
  ) {
    setSelected((current) => ({
      ...current,
      [issueId]: suggestionIndex,
    }));

    setPreview(null);
    setError("");
  }

  const selectedCount =
    Object.keys(selected).length;

  async function prepareCombinedRevision() {
    if (selectedCount === 0) {
      setError(
        "Сначала выберите хотя бы одно предложение."
      );
      return;
    }

    try {
      setApplying(true);
      setError("");
      setPreview(null);

      const selectedSuggestions =
        groups
          .map((group) => {
            const index =
              selected[group.issueId];

            if (
              index === undefined ||
              !group.suggestions[index]
            ) {
              return null;
            }

            return {
              issueId: group.issueId,
              problemTitle:
                group.problemTitle,
              suggestion:
                group.suggestions[index],
            };
          })
          .filter(Boolean);

      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/continuity/apply-suggestions`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            selections:
              selectedSuggestions,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Не удалось подготовить общее исправление."
        );
      }

      setPreview({
        revisedDraft:
          data.revisedDraft,
        changeSummary:
          data.changeSummary,
      });
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Не удалось подготовить общее исправление."
      );
    } finally {
      setApplying(false);
    }
  }

  async function acceptCombinedRevision() {
    if (
      !preview?.revisedDraft?.trim()
    ) {
      return;
    }

    try {
      setApplying(true);
      setError("");

      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            draftText:
              preview.revisedDraft,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Не удалось сохранить исправленный черновик."
        );
      }

      window.location.reload();
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить исправленный черновик."
      );
    } finally {
      setApplying(false);
    }
  }

  function cancelPreview() {
    setPreview(null);
    setError("");
  }

  return (
    <div
      style={{
        marginTop: 24,
        paddingTop: 20,
        borderTop:
          "1px solid #ddd",
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            marginBottom: 8,
          }}
        >
          ✨ AI-предложения исправлений
        </h3>

        <p
          style={{
            margin: 0,
            color: "#666",
            lineHeight: 1.5,
            fontSize: 14,
          }}
        >
          AI предлагает варианты исправления найденных
          проблем. Выберите нужные варианты, затем
          подготовьте одно общее исправление черновика.
        </p>
      </div>

      <div
        style={{
          marginTop: 16,
        }}
      >
        <button
          type="button"
          onClick={loadSuggestions}
          disabled={loading || applying}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: "#111",
            color: "#fff",
            cursor:
              loading || applying
                ? "default"
                : "pointer",
            opacity:
              loading || applying
                ? 0.6
                : 1,
          }}
        >
          {loading
            ? "Анализируем проблемы..."
            : "💡 Получить предложения AI"}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 8,
            background: "#fff1f1",
            border:
              "1px solid #e5b5b5",
            color: "#9b2222",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {groups.length > 0 && (
        <div
          style={{
            marginTop: 20,
          }}
        >
          <div
            style={{
              marginBottom: 16,
              padding: 14,
              borderRadius: 8,
              background: "#f5f7fa",
              border:
                "1px solid #e1e5ea",
            }}
          >
            <strong>
              Выбрано исправлений:{" "}
              {selectedCount}
            </strong>

            <div
              style={{
                marginTop: 5,
                color: "#666",
                fontSize: 13,
              }}
            >
              Можно выбрать по одному варианту для
              каждой найденной проблемы.
            </div>
          </div>

          {groups.map((group) => {
            const selectedIndex =
              selected[group.issueId];

            return (
              <section
                key={group.issueId}
                style={{
                  marginBottom: 20,
                  padding: 18,
                  borderRadius: 10,
                  border:
                    "1px solid #ddd",
                  background: "#fff",
                }}
              >
                <h4
                  style={{
                    margin:
                      "0 0 8px",
                    fontSize: 16,
                  }}
                >
                  ⚠️{" "}
                  {group.problemTitle}
                </h4>

                <div
                  style={{
                    marginBottom: 14,
                    color: "#777",
                    fontSize: 13,
                  }}
                >
                  Выберите вариант исправления:
                </div>

                {group.suggestions.map(
                  (
                    suggestion,
                    index
                  ) => {
                    const isSelected =
                      selectedIndex ===
                      index;

                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() =>
                          selectSuggestion(
                            group.issueId,
                            index
                          )
                        }
                        disabled={applying}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign:
                            "left",
                          marginBottom:
                            10,
                          padding: 14,
                          borderRadius: 8,
                          border:
                            isSelected
                              ? "2px solid #111"
                              : "1px solid #ddd",
                          background:
                            isSelected
                              ? "#f3f3f3"
                              : "#fff",
                          cursor:
                            applying
                              ? "default"
                              : "pointer",
                          opacity:
                            applying
                              ? 0.7
                              : 1,
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                            gap: 10,
                            marginBottom:
                              7,
                          }}
                        >
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius:
                                "50%",
                              display:
                                "inline-flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                              background:
                                isSelected
                                  ? "#111"
                                  : "#eee",
                              color:
                                isSelected
                                  ? "#fff"
                                  : "#555",
                              fontSize: 12,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {isSelected
                              ? "✓"
                              : index + 1}
                          </span>

                          <strong>
                            {
                              suggestion.title
                            }
                          </strong>
                        </div>

                        <div
                          style={{
                            marginLeft: 32,
                            color: "#555",
                            fontSize: 14,
                            lineHeight: 1.5,
                          }}
                        >
                          {
                            suggestion.explanation
                          }
                        </div>

                        {suggestion
                          .changes
                          ?.length >
                          0 && (
                          <ul
                            style={{
                              margin:
                                "10px 0 0 48px",
                              padding: 0,
                              color:
                                "#555",
                              fontSize: 13,
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
                                      4,
                                  }}
                                >
                                  {change}
                                </li>
                              )
                            )}
                          </ul>
                        )}

                        {suggestion.excerpt && (
                          <div
                            style={{
                              marginTop: 10,
                              marginLeft: 32,
                              padding: 10,
                              borderRadius: 6,
                              background:
                                "#f7f7f7",
                              fontSize: 13,
                              color:
                                "#555",
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
              </section>
            );
          })}

          <div
            style={{
              marginTop: 20,
              padding: 18,
              borderRadius: 10,
              background:
                "#f7fff8",
              border:
                "2px solid #b8d8bf",
            }}
          >
            <h4
              style={{
                margin:
                  "0 0 8px",
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
              Все выбранные исправления будут переданы
              AI одновременно. AI один раз переработает
              текущий черновик и вернёт единый вариант.
            </p>

            <button
              type="button"
              onClick={
                prepareCombinedRevision
              }
              disabled={
                selectedCount ===
                  0 ||
                applying
              }
              style={{
                padding:
                  "11px 18px",
                borderRadius: 8,
                border: "none",
                background:
                  selectedCount > 0
                    ? "#111"
                    : "#bbb",
                color: "#fff",
                cursor:
                  selectedCount ===
                    0 ||
                  applying
                    ? "default"
                    : "pointer",
              }}
            >
              {applying
                ? "AI готовит общее исправление..."
                : `✏️ Подготовить общее исправление (${selectedCount})`}
            </button>
          </div>
        </div>
      )}

      {preview && (
        <section
          style={{
            marginTop: 24,
            padding: 20,
            borderRadius: 10,
            border:
              "2px solid #9bb7d4",
            background: "#f8fbff",
          }}
        >
          <h3
            style={{
              marginTop: 0,
            }}
          >
            👀 Предпросмотр общего исправления
          </h3>

          <div
            style={{
              marginBottom: 16,
              padding: 14,
              borderRadius: 8,
              background: "#fff",
              border:
                "1px solid #ddd",
              whiteSpace:
                "pre-wrap",
              lineHeight: 1.7,
              maxHeight: 600,
              overflowY:
                "auto",
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
            <strong>
              Что изменилось:
            </strong>

            <div
              style={{
                marginTop: 6,
              }}
            >
              {preview.changeSummary}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={
                acceptCombinedRevision
              }
              disabled={applying}
              style={{
                padding:
                  "11px 18px",
                borderRadius: 8,
                border: "none",
                background:
                  "#111",
                color: "#fff",
                cursor:
                  applying
                    ? "default"
                    : "pointer",
                opacity:
                  applying
                    ? 0.6
                    : 1,
              }}
            >
              {applying
                ? "Сохраняем..."
                : "✓ Принять общее исправление"}
            </button>

            <button
              type="button"
              onClick={
                cancelPreview
              }
              disabled={applying}
              style={{
                padding:
                  "11px 18px",
                borderRadius: 8,
                border:
                  "1px solid #ccc",
                background:
                  "#fff",
                color:
                  "#222",
                cursor:
                  applying
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