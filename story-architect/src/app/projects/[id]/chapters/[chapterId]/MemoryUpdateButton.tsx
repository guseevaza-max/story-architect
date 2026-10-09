"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MemoryUpdate = {
  type: string;
  title: string;
  content: string;
  safety: "SAFE" | "UNCERTAIN" | "CONFLICT";
  confidence: number;
  reason: string;
};

type CharacterProposal = {
  name: string;
  role: string;
  description: string;
  appearance: string;
  history: string;
  personality: string;
  goals: string;
  fears: string;
  beliefs: string;
  values: string;
  abilities: {
    items: string[];
  };
  safety: "SAFE" | "UNCERTAIN" | "CONFLICT";
  confidence: number;
  reason: string;
};

type MemoryProposal = {
  id: string;
  status: string;
  safety: string;

  payload: {
    chapterId: string;
    chapterNumber?: number;

    shortSummary: string;
    fullSummary?: string;

    worldDelta?: {
      changes?: string[];
    };

    updates?: MemoryUpdate[];

    characterProposals?: CharacterProposal[];

    counts?: {
      total?: number;
      safe?: number;
      uncertain?: number;
      conflicts?: number;
      newCharacters?: number;
    };
  };
};

export default function MemoryUpdateButton({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [proposal, setProposal] =
    useState<MemoryProposal | null>(null);

  const [selected, setSelected] =
    useState<number[]>([]);

  const [actionLoading, setActionLoading] =
    useState(false);

  const [actionMessage, setActionMessage] =
    useState("");

  const [result, setResult] =
    useState<any>(null);

  // =====================================================
  // НОРМАЛИЗАЦИЯ PROPOSAL
  // =====================================================

  function normalizeProposal(
    rawProposal: any
  ): MemoryProposal | null {
    if (!rawProposal) {
      return null;
    }

    if (!rawProposal.payload) {
      return null;
    }

    const payload =
      rawProposal.payload;

    const updates: MemoryUpdate[] =
      Array.isArray(payload.updates)
        ? payload.updates
        : [];

    const characterProposals: CharacterProposal[] =
      Array.isArray(
        payload.characterProposals
      )
        ? payload.characterProposals
        : [];

    return {
      id: String(
        rawProposal.id ?? ""
      ),

      status: String(
        rawProposal.status ?? "PENDING"
      ),

      safety: String(
        rawProposal.safety ?? "SAFE"
      ),

      payload: {
        chapterId:
          String(
            payload.chapterId ?? ""
          ),

        chapterNumber:
          typeof payload.chapterNumber ===
          "number"
            ? payload.chapterNumber
            : undefined,

        shortSummary:
          typeof payload.shortSummary ===
          "string"
            ? payload.shortSummary
            : "",

        fullSummary:
          typeof payload.fullSummary ===
          "string"
            ? payload.fullSummary
            : "",

        worldDelta:
          payload.worldDelta &&
          typeof payload.worldDelta ===
            "object"
            ? {
                changes:
                  Array.isArray(
                    payload.worldDelta
                      .changes
                  )
                    ? payload.worldDelta
                        .changes
                    : [],
              }
            : {
                changes: [],
              },

        updates,

        characterProposals,

        counts:
          payload.counts &&
          typeof payload.counts ===
            "object"
            ? {
                total:
                  typeof payload.counts
                    .total === "number"
                    ? payload.counts.total
                    : undefined,

                safe:
                  typeof payload.counts
                    .safe === "number"
                    ? payload.counts.safe
                    : undefined,

                uncertain:
                  typeof payload.counts
                    .uncertain === "number"
                    ? payload.counts
                        .uncertain
                    : undefined,

                conflicts:
                  typeof payload.counts
                    .conflicts === "number"
                    ? payload.counts
                        .conflicts
                    : undefined,

                newCharacters:
                  typeof payload.counts
                    .newCharacters ===
                  "number"
                    ? payload.counts
                        .newCharacters
                    : undefined,
              }
            : undefined,
      },
    };
  }

  // =====================================================
  // ПРИМЕНЕНИЕ PROPOSAL
  // =====================================================

  function applyProposal(
    rawProposal: any
  ) {
    const normalized =
      normalizeProposal(
        rawProposal
      );

    if (!normalized) {
      console.error(
        "Некорректный Memory Proposal:",
        rawProposal
      );

      setProposal(null);
      setSelected([]);

      return;
    }

    const updates =
      normalized.payload
        .updates ?? [];

    const safeIndexes =
      updates
        .map(
          (
            item,
            index
          ) =>
            item.safety === "SAFE"
              ? index
              : -1
        )
        .filter(
          (index) =>
            index >= 0
        );

    setProposal(
      normalized
    );

    setResult(null);

    setSelected(
      safeIndexes
    );
  }

  // =====================================================
  // ЗАГРУЗКА PENDING MEMORY PROPOSAL
  // =====================================================

  async function loadPendingProposal() {
    try {
      const response =
        await fetch(
          `/api/projects/${projectId}/chapters/${chapterId}/memory`,
          {
            cache: "no-store",
          }
        );

      const text =
        await response.text();

      if (!text) {
        return;
      }

      let data: any;

      try {
        data =
          JSON.parse(text);
      } catch (parseError) {
        console.error(
          "Ошибка JSON при загрузке Memory Proposal:",
          parseError,
          text
        );

        return;
      }

      if (
        !response.ok ||
        !data.proposal
      ) {
        return;
      }

      applyProposal(
        data.proposal
      );
    } catch (loadError) {
      console.error(
        "Memory proposal load error:",
        loadError
      );
    }
  }

  useEffect(() => {
    loadPendingProposal();
  }, [
    projectId,
    chapterId,
  ]);

  // =====================================================
  // ЗАПУСК MEMORY UPDATE
  // =====================================================

  async function handleMemoryUpdate() {
    setLoading(true);
    setError("");
    setResult(null);
    setActionMessage("");

    try {
      const response =
        await fetch(
          `/api/projects/${projectId}/chapters/${chapterId}/memory`,
          {
            method: "POST",
          }
        );

      const text =
        await response.text();

      let data: any = {};

      try {
        data = text
          ? JSON.parse(text)
          : {};
      } catch (parseError) {
        console.error(
          "Ошибка JSON Memory Update:",
          parseError,
          text
        );

        setError(
          "Сервер вернул некорректный ответ. Посмотри терминал Codespace."
        );

        return;
      }

      if (!response.ok) {
        setError(
          data.error ||
            "Не удалось выполнить Memory Update."
        );

        return;
      }

      if (
        data.proposal?.payload
      ) {
        applyProposal(
          data.proposal
        );
      }

      setResult(data);

      router.refresh();
    } catch (requestError) {
      console.error(
        "Memory Update request error:",
        requestError
      );

      setError(
        "Ошибка соединения с сервером."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // РАБОТА С MEMORY UPDATES
  // =====================================================

  function toggleUpdate(
    index: number
  ) {
    setSelected(
      (current) =>
        current.includes(index)
          ? current.filter(
              (item) =>
                item !== index
            )
          : [
              ...current,
              index,
            ]
    );
  }

  function selectAllSafe() {
    if (!proposal) {
      return;
    }

    const updates =
      proposal.payload
        .updates ?? [];

    const safeIndexes =
      updates
        .map(
          (
            item,
            index
          ) =>
            item.safety === "SAFE"
              ? index
              : -1
        )
        .filter(
          (index) =>
            index >= 0
        );

    setSelected(
      safeIndexes
    );
  }

  // =====================================================
  // ПРИНЯТИЕ / ОТКЛОНЕНИЕ PROPOSAL
  // =====================================================

  async function handleProposalAction(
    action:
      | "ACCEPT"
      | "REJECT"
  ) {
    if (!proposal) {
      return;
    }

    const updates =
      proposal.payload
        .updates ?? [];

    const characterProposals =
      proposal.payload
        .characterProposals ?? [];

    const selectedUpdates =
      updates.filter(
        (_, index) =>
          selected.includes(index)
      );

    // ===================================================
    // ВАЖНО:
    //
    // Можно принять Proposal,
    // если есть хотя бы:
    //
    // 1. выбранные Memory Updates
    // ИЛИ
    // 2. новые персонажи
    //
    // Это исправляет ситуацию на твоём скриншоте.
    // ===================================================

    if (
      action === "ACCEPT" &&
      selectedUpdates.length === 0 &&
      characterProposals.length === 0
    ) {
      setError(
        "Выбери хотя бы одно изменение памяти или подтверди найденных персонажей."
      );

      return;
    }

    setActionLoading(true);
    setError("");
    setActionMessage("");

    try {
      // =================================================
      // FORM PAYLOAD
      // =================================================

      const editedPayload = {
        ...proposal.payload,

        updates:
          selectedUpdates,

        characterProposals:
          characterProposals,

        worldDelta: {
          changes:
            selectedUpdates.map(
              (item) =>
                `${item.title}: ${item.content}`
            ),
        },

        counts: {
          total:
            selectedUpdates.length,

          safe:
            selectedUpdates.filter(
              (item) =>
                item.safety ===
                "SAFE"
            ).length,

          uncertain:
            selectedUpdates.filter(
              (item) =>
                item.safety ===
                "UNCERTAIN"
            ).length,

          conflicts:
            selectedUpdates.filter(
              (item) =>
                item.safety ===
                "CONFLICT"
            ).length,

          newCharacters:
            characterProposals.length,
        },
      };

      // =================================================
      // ACTION
      // =================================================

      const response =
        await fetch(
          `/api/proposals/${proposal.id}/action`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(
              action === "ACCEPT"
                ? {
                    action:
                      "EDIT_AND_ACCEPT",

                    editedPayload,
                  }
                : {
                    action:
                      "REJECT",
                  }
            ),
          }
        );

      const text =
        await response.text();

      let data: any = {};

      try {
        data = text
          ? JSON.parse(text)
          : {};
      } catch (parseError) {
        console.error(
          "Ошибка JSON Proposal Action:",
          parseError,
          text
        );

        setError(
          "Сервер вернул некорректный ответ."
        );

        return;
      }

      if (!response.ok) {
        setError(
          data.error ||
            "Не удалось обработать Memory Proposal."
        );

        return;
      }

      // =================================================
      // SUCCESS
      // =================================================

      setProposal(null);
      setSelected([]);

      if (
        action === "ACCEPT"
      ) {
        if (
          characterProposals.length >
          0
        ) {
          setActionMessage(
            `Memory принято. Изменений памяти: ${selectedUpdates.length}. Новых персонажей обнаружено: ${characterProposals.length}.`
          );
        } else {
          setActionMessage(
            `Принято изменений: ${selectedUpdates.length}. Они добавлены в Memory.`
          );
        }
      } else {
        setActionMessage(
          "Memory Proposal отклонён."
        );
      }

      router.refresh();
    } catch (actionError) {
      console.error(
        "Memory Proposal action error:",
        actionError
      );

      setError(
        "Ошибка соединения с сервером."
      );
    } finally {
      setActionLoading(false);
    }
  }

  // =====================================================
  // COUNTERS
  // =====================================================

  const updates =
    proposal?.payload
      .updates ?? [];

  const characterProposals =
    proposal?.payload
      .characterProposals ?? [];

  const selectedCount =
    updates.filter(
      (_, index) =>
        selected.includes(index)
    ).length;

  const canAccept =
    selectedCount > 0 ||
    characterProposals.length > 0;

  // =====================================================
  // UI
  // =====================================================

  return (
    <div>
      {/* =================================================
          MAIN BUTTON
      ================================================= */}

      <button
        type="button"
        onClick={
          handleMemoryUpdate
        }
        disabled={loading}
        style={{
          padding:
            "12px 20px",

          borderRadius: 8,

          border: "none",

          background:
            loading
              ? "#777"
              : "#2563eb",

          color: "#fff",

          cursor:
            loading
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

      {/* =================================================
          ERROR
      ================================================= */}

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background:
              "#fff1f2",
            color:
              "#991b1b",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* =================================================
          ACTION MESSAGE
      ================================================= */}

      {actionMessage && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background:
              "#ecfdf5",
            color:
              "#166534",
            fontSize: 14,
          }}
        >
          ✓ {actionMessage}
        </div>
      )}

      {/* =================================================
          EXTRACTION RESULT
      ================================================= */}

      {result &&
        !proposal && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              border:
                "1px solid #cbd5e1",
              borderRadius: 10,
              background:
                "#f8fafc",
            }}
          >
            <h3
              style={{
                marginTop: 0,
              }}
            >
              🧠 Memory Extraction
              готов
            </h3>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(4, minmax(100px, 1fr))",
                gap: 10,
              }}
            >
              <div>
                <strong>
                  {result.summary
                    ?.total ?? 0}
                </strong>

                <div>
                  Всего
                </div>
              </div>

              <div>
                <strong>
                  {result.summary
                    ?.safe ?? 0}
                </strong>

                <div>
                  Безопасных
                </div>
              </div>

              <div>
                <strong>
                  {result.summary
                    ?.uncertain ??
                    0}
                </strong>

                <div>
                  Неопределённых
                </div>
              </div>

              <div>
                <strong>
                  {result.summary
                    ?.conflicts ??
                    0}
                </strong>

                <div>
                  Конфликтов
                </div>
              </div>
            </div>

            {result.summary
              ?.newCharacters >
              0 && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 8,
                  background:
                    "#eff6ff",
                  color:
                    "#1e3a8a",
                }}
              >
                👤 Найдено новых
                персонажей:{" "}
                <strong>
                  {
                    result.summary
                      .newCharacters
                  }
                </strong>
              </div>
            )}
          </div>
        )}

      {/* =================================================
          MEMORY PROPOSAL
      ================================================= */}

      {proposal && (
        <section
          style={{
            marginTop: 16,
            padding: 18,
            border:
              "2px solid #d9c58b",
            borderRadius: 10,
            background:
              "#fffdf5",
          }}
        >
          {/* HEADER */}

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              gap: 12,
              marginBottom:
                10,
            }}
          >
            <h3
              style={{
                margin: 0,
              }}
            >
              🧠 Memory Proposal
            </h3>

            <span
              style={{
                padding:
                  "5px 9px",
                borderRadius:
                  999,
                background:
                  proposal.safety ===
                  "CONFLICT"
                    ? "#fee2e2"
                    : proposal.safety ===
                      "UNCERTAIN"
                    ? "#fef3c7"
                    : "#dcfce7",
                fontSize:
                  12,
                fontWeight:
                  600,
              }}
            >
              {proposal.safety}
            </span>
          </div>

          <p
            style={{
              color:
                "#666",
              lineHeight:
                1.5,
            }}
          >
            AI подготовил
            изменения памяти.
            Они{" "}
            <strong>
              не становятся Canon
              автоматически
            </strong>{" "}
            — автор сам выбирает,
            что принять.
          </p>

          {/* =================================================
              NEW CHARACTERS
          ================================================= */}

          {characterProposals.length >
            0 && (
            <div
              style={{
                marginBottom:
                  18,
                padding: 16,
                border:
                  "2px solid #93c5fd",
                borderRadius: 10,
                background:
                  "#eff6ff",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom:
                    8,
                  color:
                    "#1e3a8a",
                }}
              >
                👤 Новые персонажи
              </h3>

              <p
                style={{
                  marginTop:
                    0,
                  marginBottom:
                    14,
                  color:
                    "#475569",
                  lineHeight:
                    1.5,
                }}
              >
                AI обнаружил
                персонажей,
                которых пока нет
                в Characters.
              </p>

              <div
                style={{
                  display:
                    "flex",
                  flexDirection:
                    "column",
                  gap: 10,
                }}
              >
                {characterProposals.map(
                  (
                    character,
                    index
                  ) => (
                    <div
                      key={`${proposal.id}-character-${index}`}
                      style={{
                        padding:
                          14,
                        border:
                          "1px solid #bfdbfe",
                        borderRadius:
                          9,
                        background:
                          "#fff",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          gap: 8,
                          alignItems:
                            "center",
                          flexWrap:
                            "wrap",
                          marginBottom:
                            6,
                        }}
                      >
                        <strong
                          style={{
                            fontSize:
                              16,
                          }}
                        >
                          {
                            character.name
                          }
                        </strong>

                        {character.role && (
                          <span
                            style={{
                              fontSize:
                                12,
                              padding:
                                "3px 7px",
                              borderRadius:
                                999,
                              background:
                                "#e0e7ff",
                              color:
                                "#3730a3",
                            }}
                          >
                            {
                              character.role
                            }
                          </span>
                        )}

                        <span
                          style={{
                            fontSize:
                              11,
                            padding:
                              "3px 7px",
                            borderRadius:
                              999,
                            background:
                              character.safety ===
                              "SAFE"
                                ? "#dcfce7"
                                : character.safety ===
                                  "UNCERTAIN"
                                ? "#fef3c7"
                                : "#fee2e2",
                          }}
                        >
                          {
                            character.safety
                          }
                        </span>

                        <span
                          style={{
                            fontSize:
                              11,
                            color:
                              "#777",
                          }}
                        >
                          confidence{" "}
                          {(
                            Number(
                              character.confidence ||
                                0
                            ) * 100
                          ).toFixed(
                            0
                          )}
                          %
                        </span>
                      </div>

                      {character.description && (
                        <div
                          style={{
                            color:
                              "#444",
                            lineHeight:
                              1.5,
                          }}
                        >
                          {
                            character.description
                          }
                        </div>
                      )}

                      {character.appearance && (
                        <div
                          style={{
                            marginTop:
                              6,
                            fontSize:
                              13,
                            color:
                              "#555",
                          }}
                        >
                          <strong>
                            Внешность:
                          </strong>{" "}
                          {
                            character.appearance
                          }
                        </div>
                      )}

                      {character.history && (
                        <div
                          style={{
                            marginTop:
                              6,
                            fontSize:
                              13,
                            color:
                              "#555",
                          }}
                        >
                          <strong>
                            История:
                          </strong>{" "}
                          {
                            character.history
                          }
                        </div>
                      )}

                      {character.personality && (
                        <div
                          style={{
                            marginTop:
                              6,
                            fontSize:
                              13,
                            color:
                              "#555",
                          }}
                        >
                          <strong>
                            Характер:
                          </strong>{" "}
                          {
                            character.personality
                          }
                        </div>
                      )}

                      {character.goals && (
                        <div
                          style={{
                            marginTop:
                              6,
                            fontSize:
                              13,
                            color:
                              "#555",
                          }}
                        >
                          <strong>
                            Цели:
                          </strong>{" "}
                          {
                            character.goals
                          }
                        </div>
                      )}

                      {character.fears && (
                        <div
                          style={{
                            marginTop:
                              6,
                            fontSize:
                              13,
                            color:
                              "#555",
                          }}
                        >
                          <strong>
                            Страхи:
                          </strong>{" "}
                          {
                            character.fears
                          }
                        </div>
                      )}

                      {character.beliefs && (
                        <div
                          style={{
                            marginTop:
                              6,
                            fontSize:
                              13,
                            color:
                              "#555",
                          }}
                        >
                          <strong>
                            Убеждения:
                          </strong>{" "}
                          {
                            character.beliefs
                          }
                        </div>
                      )}

                      {character.values && (
                        <div
                          style={{
                            marginTop:
                              6,
                            fontSize:
                              13,
                            color:
                              "#555",
                          }}
                        >
                          <strong>
                            Ценности:
                          </strong>{" "}
                          {
                            character.values
                          }
                        </div>
                      )}

                      {character
                        .abilities
                        ?.items
                        ?.length >
                        0 && (
                        <div
                          style={{
                            marginTop:
                              6,
                            fontSize:
                              13,
                            color:
                              "#555",
                          }}
                        >
                          <strong>
                            Способности:
                          </strong>{" "}
                          {character.abilities.items.join(
                            ", "
                          )}
                        </div>
                      )}

                      {character.reason && (
                        <div
                          style={{
                            marginTop:
                              8,
                            fontSize:
                              12,
                            color:
                              "#777",
                          }}
                        >
                          Почему:{" "}
                          {
                            character.reason
                          }
                        </div>
                      )}

                      <div
                        style={{
                          marginTop:
                            10,
                          padding: 9,
                          borderRadius:
                            7,
                          background:
                            "#f8fafc",
                          fontSize:
                            12,
                          color:
                            "#64748b",
                        }}
                      >
                        ⏳ Персонаж пока
                        не добавлен в
                        Canon.
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* =================================================
              MEMORY UPDATES
          ================================================= */}

          <div
            style={{
              display:
                "flex",
              gap: 8,
              flexWrap:
                "wrap",
              marginBottom:
                14,
            }}
          >
            <button
              type="button"
              onClick={
                selectAllSafe
              }
              disabled={
                updates.length ===
                0
              }
              style={{
                padding:
                  "8px 12px",
                borderRadius:
                  7,
                border:
                  "1px solid #ccc",
                background:
                  updates.length ===
                  0
                    ? "#f1f1f1"
                    : "#fff",
                color:
                  updates.length ===
                  0
                    ? "#999"
                    : "#222",
                cursor:
                  updates.length ===
                  0
                    ? "default"
                    : "pointer",
              }}
            >
              ✓ Выбрать
              безопасные
            </button>

            <button
              type="button"
              onClick={() =>
                setSelected([])
              }
              disabled={
                updates.length ===
                0
              }
              style={{
                padding:
                  "8px 12px",
                borderRadius:
                  7,
                border:
                  "1px solid #ccc",
                background:
                  updates.length ===
                  0
                    ? "#f1f1f1"
                    : "#fff",
                color:
                  updates.length ===
                  0
                    ? "#999"
                    : "#222",
                cursor:
                  updates.length ===
                  0
                    ? "default"
                    : "pointer",
              }}
            >
              Снять выбор
            </button>
          </div>

          <div
            style={{
              display:
                "flex",
              flexDirection:
                "column",
              gap: 10,
            }}
          >
            {updates.length ===
            0 ? (
              <div
                style={{
                  padding:
                    14,
                  border:
                    "1px solid #ddd",
                  borderRadius:
                    9,
                  background:
                    "#fff",
                  color:
                    "#666",
                }}
              >
                В Memory нет
                отдельных
                изменений.
              </div>
            ) : (
              updates.map(
                (
                  item,
                  index
                ) => {
                  const checked =
                    selected.includes(
                      index
                    );

                  return (
                    <label
                      key={`${proposal.id}-${index}`}
                      style={{
                        display:
                          "block",
                        padding:
                          14,
                        border:
                          checked
                            ? "2px solid #86b99a"
                            : "1px solid #ddd",
                        borderRadius:
                          9,
                        background:
                          checked
                            ? "#f7fff8"
                            : "#fff",
                        cursor:
                          "pointer",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          gap: 10,
                          alignItems:
                            "flex-start",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            checked
                          }
                          onChange={() =>
                            toggleUpdate(
                              index
                            )
                          }
                          style={{
                            marginTop:
                              4,
                          }}
                        />

                        <div
                          style={{
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              display:
                                "flex",
                              gap: 8,
                              alignItems:
                                "center",
                              flexWrap:
                                "wrap",
                              marginBottom:
                                5,
                            }}
                          >
                            <strong>
                              {
                                item.title
                              }
                            </strong>

                            <span
                              style={{
                                fontSize:
                                  11,
                                padding:
                                  "3px 7px",
                                borderRadius:
                                  999,
                                background:
                                  item.safety ===
                                  "SAFE"
                                    ? "#dcfce7"
                                    : item.safety ===
                                      "UNCERTAIN"
                                    ? "#fef3c7"
                                    : "#fee2e2",
                              }}
                            >
                              {
                                item.safety
                              }
                            </span>

                            <span
                              style={{
                                fontSize:
                                  11,
                                color:
                                  "#777",
                              }}
                            >
                              confidence{" "}
                              {(
                                Number(
                                  item.confidence ||
                                    0
                                ) * 100
                              ).toFixed(
                                0
                              )}
                              %
                            </span>
                          </div>

                          <div
                            style={{
                              color:
                                "#444",
                              lineHeight:
                                1.5,
                            }}
                          >
                            {
                              item.content
                            }
                          </div>

                          <div
                            style={{
                              marginTop:
                                6,
                              fontSize:
                                12,
                              color:
                                "#777",
                            }}
                          >
                            Почему:{" "}
                            {
                              item.reason
                            }
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                }
              )
            )}
          </div>

          {/* =================================================
              ACTIONS
          ================================================= */}

          <div
            style={{
              marginTop:
                16,
              paddingTop:
                16,
              borderTop:
                "1px solid #ddd",
              display:
                "flex",
              gap: 10,
              flexWrap:
                "wrap",
            }}
          >
            <button
              type="button"
              onClick={() =>
                handleProposalAction(
                  "ACCEPT"
                )
              }
              disabled={
                actionLoading ||
                !canAccept
              }
              style={{
                padding:
                  "11px 16px",
                borderRadius:
                  8,
                border:
                  "none",
                background:
                  actionLoading ||
                  !canAccept
                    ? "#aaa"
                    : "#166534",
                color:
                  "#fff",
                cursor:
                  actionLoading ||
                  !canAccept
                    ? "default"
                    : "pointer",
                fontWeight:
                  600,
              }}
            >
              {actionLoading
                ? "⏳ Сохраняем..."
                : selectedCount >
                    0
                  ? `✓ Принять выбранные (${selectedCount})`
                  : `✓ Принять предложение${
                      characterProposals.length >
                      0
                        ? ` (${characterProposals.length} персонаж${
                            characterProposals.length ===
                            1
                              ? ""
                              : "ей"
                          })`
                        : ""
                    }`}
            </button>

            <button
              type="button"
              onClick={() =>
                handleProposalAction(
                  "REJECT"
                )
              }
              disabled={
                actionLoading
              }
              style={{
                padding:
                  "11px 16px",
                borderRadius:
                  8,
                border:
                  "1px solid #b91c1c",
                background:
                  "#fff",
                color:
                  "#b91c1c",
                cursor:
                  actionLoading
                    ? "default"
                    : "pointer",
                fontWeight:
                  600,
              }}
            >
              Отклонить Proposal
            </button>
          </div>
        </section>
      )}
    </div>
  );
}