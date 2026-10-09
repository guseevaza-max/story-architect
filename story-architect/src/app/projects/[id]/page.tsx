import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
  });

  if (!project) {
    notFound();
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
      <div style={{ marginBottom: 30 }}>
        <Link href="/dashboard">← Назад в Dashboard</Link>
      </div>

      <h1>{project.name}</h1>

      <p style={{ color: "#666", fontSize: 18 }}>
        Story Architect — рабочее пространство проекта
      </p>

      <section
        style={{
          marginTop: 30,
          padding: 24,
          border: "1px solid #ddd",
          borderRadius: 12,
        }}
      >
        <h2>Информация о проекте</h2>

        <p>
          <strong>Название:</strong> {project.name}
        </p>

        {project.genre && (
          <p>
            <strong>Жанр:</strong> {project.genre}
          </p>
        )}

        {project.premise && (
          <p>
            <strong>Premise:</strong> {project.premise}
          </p>
        )}

        {project.description && (
          <p>
            <strong>Описание:</strong> {project.description}
          </p>
        )}

        {project.tone && (
          <p>
            <strong>Тон:</strong> {project.tone}
          </p>
        )}

        {project.targetAudience && (
          <p>
            <strong>Целевая аудитория:</strong>{" "}
            {project.targetAudience}
          </p>
        )}
      </section>

      <section
        style={{
          marginTop: 30,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {/* Story Bible */}
        <Link
          href={`/projects/${project.id}/story-bible`}
          style={{
            display: "block",
            padding: 24,
            border: "1px solid #ccc",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "#fff",
          }}
        >
          <h2>📖 Story Bible</h2>

          <p>
            Опишите вселенную и историю. AI извлечёт персонажей,
            события, правила мира, сюжетные линии и другие элементы.
          </p>

          <strong>Открыть AI-анализ →</strong>
        </Link>

        {/* AI Proposals */}
        <Link
          href={`/projects/${project.id}/proposals`}
          style={{
            display: "block",
            padding: 24,
            border: "1px solid #ccc",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "#fafafa",
          }}
        >
          <h2>🤖 Предложения AI</h2>

          <p>
            Просмотрите предложения AI и решите, какие элементы
            добавить в Canon вашей истории.
          </p>

          <strong>Открыть предложения →</strong>
        </Link>

        {/* Characters */}
        <Link
          href={`/projects/${project.id}/characters`}
          style={{
            display: "block",
            padding: 24,
            border: "1px solid #ccc",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "#fff",
          }}
        >
          <h2>👤 Characters</h2>

          <p>
            Персонажи проекта, принятые автором в Canon.
          </p>

          <strong>Открыть персонажей →</strong>
        </Link>

        {/* World */}
        <Link
          href={`/projects/${project.id}/world`}
          style={{
            display: "block",
            padding: 24,
            border: "1px solid #ccc",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "#fff",
          }}
        >
          <h2>🌍 World</h2>

          <p>
            Мир, фракции, локации и правила вашей истории.
          </p>

          <strong>Открыть мир →</strong>
        </Link>

        {/* Chapters */}
        <Link
          href={`/projects/${project.id}/chapters`}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            border: "1px solid #ddd",
            borderRadius: 14,
            padding: 24,
            background: "#fff",
            transition: "0.2s",
          }}
        >
          <h2 style={{ marginTop: 0 }}>📚 Chapters</h2>

          <p style={{ color: "#666", lineHeight: 1.6 }}>
            Главы, планы, сцены, черновики и финальный текст.
          </p>

          <strong>Открыть главы →</strong>
        </Link>

        {/* Memory */}
        <Link
          href={`/projects/${project.id}/memory`}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            border: "1px solid #c9b7e8",
            borderRadius: 14,
            padding: 24,
            background: "#faf8ff",
            transition: "0.2s",
          }}
        >
          <h2 style={{ marginTop: 0 }}>🧠 Memory</h2>

          <p
            style={{
              color: "#666",
              lineHeight: 1.6,
            }}
          >
            Подтверждённая память истории: факты,
            персонажи, события, отношения, тайны и
            изменения мира.
          </p>

          <strong>Открыть Memory →</strong>
        </Link>

        {/* Relationships */}
        <Link
          href={`/projects/${project.id}/relationships`}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            border: "1px solid #ddd",
            borderRadius: 14,
            padding: 24,
            background: "#fff",
          }}
        >
          <h2 style={{ marginTop: 0 }}>🤝 Relationships</h2>

          <p style={{ color: "#666", lineHeight: 1.6 }}>
            Действующие отношения персонажей и история их изменений.
          </p>

          <strong>Открыть отношения →</strong>
        </Link>

        {/* Plot Lines */}
        <Link
          href={`/projects/${project.id}/plot-lines`}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            border: "1px solid #ddd",
            borderRadius: 14,
            padding: 24,
            background: "#fff",
          }}
        >
          <h2 style={{ marginTop: 0 }}>🧵 Plot Lines</h2>

          <p style={{ color: "#666", lineHeight: 1.6 }}>
            Сюжетные линии, их этапы и прогресс по главам.
          </p>

          <strong>Открыть линии →</strong>
        </Link>

        {/* Timeline */}
        <Link
          href={`/projects/${project.id}/timeline`}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            border: "1px solid #ddd",
            borderRadius: 14,
            padding: 24,
            background: "#fff",
          }}
        >
          <h2 style={{ marginTop: 0 }}>🕰️ Timeline</h2>

          <p style={{ color: "#666", lineHeight: 1.6 }}>
            События истории в хронологическом порядке.
          </p>

          <strong>Открыть таймлайн →</strong>
        </Link>
      </section>
    </main>
  );
}