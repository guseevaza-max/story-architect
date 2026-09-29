"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SaveIdeaForm({
  projectId,
  chapterId,
  initialIdea,
}: {
  projectId: string;
  chapterId: string;
  initialIdea: string;
}) {
  const router = useRouter();

  const [idea, setIdea] = useState(initialIdea);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");

    const trimmedIdea = idea.trim();

    if (!trimmedIdea) {
      setMessage("Идея не может быть пустой.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            authorIdea: trimmedIdea,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Не удалось сохранить идею.");
        return;
      }

      setMessage("Идея сохранена.");

      router.refresh();
    } catch (error) {
      console.error(error);
      setMessage("Ошибка соединения с сервером.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        name="authorIdea"
        value={idea}
        onChange={(event) => setIdea(event.target.value)}
        placeholder="Опишите своими словами, что должно произойти в этой главе..."
        rows={8}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: 14,
          border: "1px solid #ccc",
          borderRadius: 10,
          fontSize: 15,
          lineHeight: 1.6,
          resize: "vertical",
          fontFamily: "Arial, sans-serif",
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginTop: 14,
        }}
      >
        <div
          style={{
            color: message === "Идея сохранена." ? "#166534" : "#777",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {message ||
            "Чем подробнее идея, тем точнее Architect сможет построить план главы."}
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "11px 18px",
            border: "none",
            borderRadius: 9,
            background: "#111",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {saving ? "Сохранение..." : "💾 Сохранить идею"}
        </button>
      </div>
    </form>
  );
}