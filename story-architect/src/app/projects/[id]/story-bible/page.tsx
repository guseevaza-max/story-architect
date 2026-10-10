"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type AnalysisResult = {
  facts: string[];
  characters: string[];
  locations: string[];
  factions: string[];
  worldRules: string[];
  events: string[];
  relationships: string[];
  secrets: string[];
  plotLines: string[];
  openQuestions: string[];
};

const sections: {
  key: keyof AnalysisResult;
  title: string;
}[] = [
  { key: "facts", title: "📌 Факты" },
  { key: "characters", title: "👤 Персонажи" },
  { key: "locations", title: "🌍 Локации" },
  { key: "factions", title: "⚔️ Фракции" },
  { key: "worldRules", title: "⚙️ Правила мира" },
  { key: "events", title: "📜 События" },
  { key: "relationships", title: "🔗 Отношения" },
  { key: "secrets", title: "🔮 Секреты" },
  { key: "plotLines", title: "📖 Сюжетные линии" },
  { key: "openQuestions", title: "❓ Открытые вопросы" },
];

type ProposalSummary = {
  created: Record<string, number>;
  createdTotal: number;
  skipped: { category: string; text: string; reason: string }[];
  notMapped: {
    facts: number;
    relationships: number;
    secrets: number;
    openQuestions: number;
  };
  failed: { category: string; error: string }[];
};

const CATEGORY_LABELS: Record<string, string> = {
  characters: "Персонажи",
  locations: "Локации",
  factions: "Фракции",
  worldRules: "Правила мира",
  events: "События",
  plotLines: "Сюжетные линии",
  other: "Прочее",
};

const SKIP_LABELS: Record<string, string> = {
  duplicate_canon: "уже есть в Canon",
  duplicate_pending: "уже ждёт вашего решения",
  previously_rejected: "ранее отклонено вами",
  duplicate_in_analysis: "повтор внутри анализа",
  unnamed: "безымянная фигура: нужно имя",
  empty: "пустая строка",
  ambiguous_type: "тип неоднозначен (одно название как локация и фракция)",
  state_not_location: "государство не создаётся как локация или фракция",
  state_not_supported:
    "государство: для него пока нет типа предложения, добавьте вручную",
  not_a_faction:
    "государственный орган или абстрактное понятие, не самостоятельная фракция",
  not_a_plot_line:
    "единичный факт или последствие, а не развивающаяся сюжетная линия",
  single_fact: "единичный факт или последствие, не отдельная сущность",
  low_confidence: "низкая уверенность AI в типе",
  unsupported_kind: "тип неоднозначен, нужно уточнение автора",
};

export default function StoryBiblePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">(
    "idle"
  );
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [summary, setSummary] = useState<ProposalSummary | null>(null);
  const [proposalError, setProposalError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Загрузка сохранённого текста при открытии страницы.
  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    async function load() {
      setLoaded(false);
      setLoadError("");

      try {
        const response = await fetch(`/api/projects/${projectId}/story-bible`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Не удалось загрузить сохранённый текст.");
        }

        if (cancelled) return;

        const stored = typeof data.text === "string" ? data.text : "";

        setText(stored);
        setSavedText(stored);

        if (data.updatedAt) {
          setSavedAt(new Date(data.updatedAt));
        }

        setLoaded(true);
      } catch (loadFailure) {
        if (cancelled) return;

        setLoadError(
          loadFailure instanceof Error
            ? loadFailure.message
            : "Не удалось загрузить сохранённый текст."
        );
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  const saveText = useCallback(
    async (value: string): Promise<boolean> => {
      setSaveState("saving");
      setSaveError("");

      try {
        const response = await fetch(`/api/projects/${projectId}/story-bible`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: value }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Не удалось сохранить текст.");
        }

        setSavedText(value);
        setSavedAt(data.updatedAt ? new Date(data.updatedAt) : new Date());
        setSaveState("idle");

        return true;
      } catch (saveFailure) {
        setSaveState("error");
        setSaveError(
          saveFailure instanceof Error
            ? saveFailure.message
            : "Не удалось сохранить текст."
        );

        return false;
      }
    },
    [projectId]
  );

  const hasUnsaved = loaded && text !== savedText;

  // Автосохранение через 1,5 секунды после последнего изменения.
  // Не запускается, пока идёт предыдущее сохранение, чтобы старая версия
  // текста не затёрла новую. После ошибки повторяется только по кнопке
  // «Сохранить».
  useEffect(() => {
    if (!hasUnsaved || saveState !== "idle") return;

    const timer = setTimeout(() => {
      void saveText(text);
    }, 1500);

    return () => clearTimeout(timer);
  }, [hasUnsaved, saveState, text, saveText]);

  // Предупреждение браузера, если закрыть вкладку с несохранённым текстом.
  useEffect(() => {
    if (!hasUnsaved && saveState !== "saving") return;

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved, saveState]);

  function statusText(): { text: string; color: string } {
    if (loadError) {
      return { text: `⚠️ ${loadError}`, color: "#cc0000" };
    }

    if (!loaded) {
      return { text: "Загрузка сохранённого текста…", color: "#666" };
    }

    if (saveState === "saving") {
      return { text: "Сохранение…", color: "#666" };
    }

    if (saveState === "error") {
      return {
        text: `⚠️ ${saveError || "Не удалось сохранить."} Текст остался на странице.`,
        color: "#cc0000",
      };
    }

    if (hasUnsaved) {
      return { text: "Есть несохранённые изменения", color: "#8a5a00" };
    }

    return {
      text: savedAt
        ? `✓ Сохранено в ${savedAt.toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "✓ Сохранено",
      color: "#26733a",
    };
  }

  const status = statusText();

  async function analyzeText() {
    if (!text.trim()) {
      setError("Сначала введите текст.");
      setResult(null);
      return;
    }

    if (!projectId) {
      setError("Не найден ID проекта.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setSummary(null);
    setProposalError("");

    // Сначала сохраняем текст: анализ не должен приводить к его потере.
    if (text !== savedText) {
      await saveText(text);
    }

    try {
      // 1. Анализируем текст через AI
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Ошибка анализа.");
        return;
      }

      const analysis: AnalysisResult = data.result;

      // 2. Показываем результат анализа сразу: он не должен пропасть,
      //    даже если создание предложений завершится ошибкой.
      setResult(analysis);

      // 3. Создаём предложения для автора (Canon не меняется).
      //    Каждая категория обрабатывается независимо на сервере.
      try {
        const proposalResponse = await fetch(
          `/api/projects/${projectId}/story-bible/proposals`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ analysis }),
          }
        );

        const proposalData = await proposalResponse.json().catch(() => ({}));

        if (!proposalResponse.ok) {
          throw new Error(
            proposalData.error || "Не удалось создать предложения."
          );
        }

        setSummary(proposalData as ProposalSummary);
      } catch (proposalFailure) {
        console.error("Story Bible proposals error:", proposalFailure);

        setProposalError(
          proposalFailure instanceof Error
            ? proposalFailure.message
            : "Не удалось создать предложения."
        );
      }
    } catch (error) {
      console.error("Story Bible error:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Не удалось выполнить запрос."
      );
    } finally {
      setLoading(false);
    }
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
      <h1>Story Bible</h1>

      <p>
        Опишите ваш мир и историю. AI проанализирует текст и
        предложит структуру Story Bible.
      </p>

      <textarea
        value={text}
        disabled={!loaded}
        onChange={(event) => setText(event.target.value)}
        placeholder={
          loaded
            ? "Опишите вашу вселенную здесь..."
            : "Загрузка сохранённого текста..."
        }
        style={{
          width: "100%",
          minHeight: 400,
          padding: 16,
          fontSize: 16,
          lineHeight: 1.5,
          boxSizing: "border-box",
          resize: "vertical",
        }}
      />

      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          fontSize: 14,
          color: status.color,
        }}
      >
        <span>{status.text}</span>

        {loadError && (
          <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
            Повторить загрузку
          </button>
        )}

        {loaded && (hasUnsaved || saveState === "error") && (
          <button
            type="button"
            onClick={() => void saveText(text)}
            disabled={saveState === "saving"}
          >
            Сохранить
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={analyzeText}
        disabled={loading || !loaded}
        style={{
          marginTop: 16,
          padding: "12px 24px",
          fontSize: 16,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Анализ..." : "Analyze with AI"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            border: "1px solid #cc0000",
            borderRadius: 8,
          }}
        >
          <strong>Ошибка:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 30 }}>
          <h2>Предварительный анализ</h2>

          <p>
            Это пока предложение AI. Ничего из этого автоматически
            не становится Canon.
          </p>

          {proposalError && (
            <div
              style={{
                marginTop: 16,
                padding: 16,
                border: "1px solid #cc0000",
                borderRadius: 8,
              }}
            >
              <strong>Предложения не созданы:</strong> {proposalError}. Текст и
              анализ сохранены, можно запустить анализ ещё раз.
            </div>
          )}

          {summary && (
            <div
              style={{
                marginTop: 16,
                padding: 16,
                border: "1px solid #ddd",
                borderRadius: 8,
                background: "#fafafa",
                lineHeight: 1.7,
              }}
            >
              <strong>
                Создано предложений для вашего решения: {summary.createdTotal}
              </strong>

              {summary.createdTotal > 0 && (
                <div>
                  {Object.entries(summary.created)
                    .map(
                      ([category, count]) =>
                        `${CATEGORY_LABELS[category] ?? category}: ${count}`
                    )
                    .join(" · ")}
                </div>
              )}

              {summary.failed.length > 0 && (
                <div style={{ color: "#cc0000" }}>
                  Не удалось создать:{" "}
                  {summary.failed
                    .map(
                      (item) =>
                        `${CATEGORY_LABELS[item.category] ?? item.category} (${item.error})`
                    )
                    .join("; ")}
                </div>
              )}

              {summary.skipped.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary>Пропущено: {summary.skipped.length}</summary>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                    {summary.skipped.map((item, index) => (
                      <li key={`${item.category}-${index}`}>
                        {CATEGORY_LABELS[item.category] ?? item.category}:{" "}
                        {item.text} — {SKIP_LABELS[item.reason] ?? item.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {summary.notMapped.facts +
                summary.notMapped.relationships +
                summary.notMapped.secrets +
                summary.notMapped.openQuestions >
                0 && (
                <div style={{ color: "#666", fontSize: 14, marginTop: 8 }}>
                  Только для просмотра (предложения для них пока не создаются):
                  факты {summary.notMapped.facts}, отношения{" "}
                  {summary.notMapped.relationships}, секреты{" "}
                  {summary.notMapped.secrets}, открытые вопросы{" "}
                  {summary.notMapped.openQuestions}.
                </div>
              )}

              {summary.createdTotal > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Link href={`/projects/${projectId}/proposals`}>
                    Перейти к предложениям →
                  </Link>
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gap: 16,
              marginTop: 20,
            }}
          >
            {sections.map((section) => {
              const items = result[section.key];

              if (!items || items.length === 0) {
                return null;
              }

              return (
                <section
                  key={section.key}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: 8,
                    padding: 20,
                  }}
                >
                  <h3>{section.title}</h3>

                  <ul>
                    {items.map((item, index) => (
                      <li
                        key={index}
                        style={{ marginBottom: 8 }}
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}