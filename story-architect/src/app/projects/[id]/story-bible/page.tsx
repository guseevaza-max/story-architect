"use client";

import { useState } from "react";
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

export default function StoryBiblePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [text, setText] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

      // 2. Персонажей из AI-анализа создаём как Proposal
      for (const character of analysis.characters) {
        const proposalResponse = await fetch("/api/proposals", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId,
            entityType: "CHARACTER",
            op: "CREATE",
            payload: {
              entityType: "CHARACTER",
              data: {
                name: character,
                description: character,
              },
            },
            reason: "Персонаж извлечён AI из текста Story Bible",
            safety: "UNCERTAIN",
          }),
        });

        if (!proposalResponse.ok) {
          const proposalData = await proposalResponse.json();

          throw new Error(
            proposalData.error || "Не удалось создать Proposal"
          );
        }
      }

      // 3. Показываем результат анализа
      setResult(analysis);
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
        onChange={(event) => setText(event.target.value)}
        placeholder="Опишите вашу вселенную здесь..."
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

      <button
        type="button"
        onClick={analyzeText}
        disabled={loading}
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