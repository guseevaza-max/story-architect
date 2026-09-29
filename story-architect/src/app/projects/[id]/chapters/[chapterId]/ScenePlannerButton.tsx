"use client";

import { useState } from "react";

type Scene = {
  order: number;
  title: string;
  purpose: string;
  plan: string[];
  plannedOutcome: string;
};

type ScenePlan = {
  scenes: Scene[];
  openQuestions: string[];
};

export default function ScenePlannerButton({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [scenePlan, setScenePlan] = useState<ScenePlan | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setProposalId(null);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/scene-planner`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error || "Не удалось создать план сцен."
        );
        return;
      }

      console.log("Scene Planner response:", data);

      if (!data.proposalId) {
        setError(
          "План сцен создан, но Proposal не был создан. Проверь API Scene Planner."
        );
        setScenePlan(data.scenePlan || null);
        return;
      }

      setProposalId(data.proposalId);
      setScenePlan(data.scenePlan || null);
    } catch (error) {
      console.error(error);
      setError("Ошибка соединения с сервером.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "none",
          background: loading ? "#777" : "#111",
          color: "#fff",
          cursor: loading ? "default" : "pointer",
          fontWeight: 600,
        }}
      >
        {loading
          ? "⏳ Создание плана сцен..."
          : "🎬 Сформировать план сцен"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: "#fee2e2",
            color: "#991b1b",
          }}
        >
          {error}
        </div>
      )}

      {proposalId && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: "#e8f5e9",
            color: "#287a35",
            fontSize: 13,
          }}
        >
          ✓ Proposal плана сцен создан.
          <br />
          ID: {proposalId}
        </div>
      )}

      {scenePlan && (
        <div
          style={{
            marginTop: 20,
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 20,
            background: "#fafafa",
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            🎬 Предварительный план сцен
          </h3>

          <p
            style={{
              color: "#666",
              fontSize: 14,
            }}
          >
            Это предложение Scene Planner. Пока оно не
            сохраняется в Canon и не становится окончательным.
          </p>

          {scenePlan.scenes.map((scene) => (
            <div
              key={scene.order}
              style={{
                marginTop: 16,
                padding: 16,
                border: "1px solid #ddd",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#777",
                  marginBottom: 5,
                }}
              >
                Сцена {scene.order}
              </div>

              <h4
                style={{
                  margin: "0 0 10px",
                  fontSize: 18,
                }}
              >
                {scene.title}
              </h4>

              <div style={{ marginBottom: 12 }}>
                <strong>Цель сцены</strong>
                <p>{scene.purpose}</p>
              </div>

              <div style={{ marginBottom: 12 }}>
                <strong>План</strong>

                <ul>
                  {scene.plan.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <strong>Ожидаемый результат</strong>
                <p>{scene.plannedOutcome}</p>
              </div>
            </div>
          ))}

          {scenePlan.openQuestions.length > 0 && (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 10,
                background: "#fff7ed",
              }}
            >
              <strong>Открытые вопросы</strong>

              <ul>
                {scenePlan.openQuestions.map(
                  (question, index) => (
                    <li key={index}>{question}</li>
                  )
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}