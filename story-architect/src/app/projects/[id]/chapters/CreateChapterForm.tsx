"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateChapterForm({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [authorIdea, setAuthorIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (!title.trim()) {
      setError("Введите название главы.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/chapters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          purpose,
          authorIdea,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Не удалось создать главу.");
        return;
      }

      setTitle("");
      setPurpose("");
      setAuthorIdea("");
      setOpen(false);

      router.refresh();
    } catch {
      setError("Ошибка соединения с сервером.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "12px 18px",
          border: "none",
          borderRadius: 10,
          background: "#111",
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        ＋ Создать главу
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: 18,
        padding: 20,
        border: "1px solid #ddd",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <form onSubmit={handleSubmit}>
        <h3 style={{ marginTop: 0 }}>Новая глава</h3>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              marginBottom: 7,
              fontWeight: 600,
            }}
          >
            Название главы
          </label>

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Например: Глава 1 — Пробуждение"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              fontSize: 15,
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              marginBottom: 7,
              fontWeight: 600,
            }}
          >
            Назначение главы
          </label>

          <textarea
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="Что должна сделать эта глава в истории?"
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              fontSize: 15,
              resize: "vertical",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              marginBottom: 7,
              fontWeight: 600,
            }}
          >
            Идея автора
          </label>

          <textarea
            value={authorIdea}
            onChange={(event) => setAuthorIdea(event.target.value)}
            placeholder="Опишите своими словами, что должно произойти в главе..."
            rows={6}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              fontSize: 15,
              resize: "vertical",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 10,
              borderRadius: 8,
              background: "#fee2e2",
              color: "#991b1b",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 10,
          }}
        >
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 16px",
              border: "none",
              borderRadius: 8,
              background: "#111",
              color: "#fff",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Создание..." : "Создать главу"}
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError("");
            }}
            style={{
              padding: "10px 16px",
              border: "1px solid #ccc",
              borderRadius: 8,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}