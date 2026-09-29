"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectPage() {
  const router = useRouter();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.get("name"),
          genre: formData.get("genre"),
          premise: formData.get("premise"),
          description: formData.get("description"),
          tone: formData.get("tone"),
          targetAudience: formData.get("targetAudience"),
          language: formData.get("language"),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Не удалось создать проект");
        return;
      }

      router.push(`/projects/${data.project.id}`);
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 700,
        margin: "0 auto",
        padding: 40,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ marginBottom: 30 }}>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          style={{
            padding: "8px 14px",
            border: "1px solid #ccc",
            borderRadius: 8,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          ← Назад в Dashboard
        </button>
      </div>

      <h1>Create Project</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: 16,
          marginTop: 24,
        }}
      >
        <label>
          Title
          <input
            name="name"
            placeholder="The Last Cycle"
            required
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              boxSizing: "border-box",
            }}
          />
        </label>

        <label>
          Genre
          <input
            name="genre"
            placeholder="LitRPG / Progress Fantasy"
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              boxSizing: "border-box",
            }}
          />
        </label>

        <label>
          Premise
          <textarea
            name="premise"
            placeholder="Главная идея истории..."
            rows={4}
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              boxSizing: "border-box",
            }}
          />
        </label>

        <label>
          Description
          <textarea
            name="description"
            placeholder="Описание мира и истории..."
            rows={5}
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              boxSizing: "border-box",
            }}
          />
        </label>

        <label>
          Tone
          <input
            name="tone"
            placeholder="Dark, epic, mysterious"
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              boxSizing: "border-box",
            }}
          />
        </label>

        <label>
          Target audience
          <input
            name="targetAudience"
            placeholder="18+"
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              boxSizing: "border-box",
            }}
          />
        </label>

        <label>
          Language
          <select
            name="language"
            defaultValue="ru"
            style={{
              display: "block",
              padding: 8,
            }}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </label>

        {error && (
          <p style={{ color: "red" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 16px",
            border: "1px solid #ccc",
            borderRadius: 8,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Создание..." : "Create Project"}
        </button>
      </form>
    </main>
  );
}