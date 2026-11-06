import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import ProjectSummaryView from "./_components/ProjectSummaryView";
import { loadProjectSummary, type ProjectSummary } from "@/lib/ux/summary";

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

  let summary: ProjectSummary | null = null;
  try {
    summary = await loadProjectSummary(prisma, session.user.id, project.id);
  } catch (error) {
    console.error("Project summary error:", error);
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 40,
        fontFamily: "var(--font-ui), system-ui, sans-serif",
      }}
    >
      <div style={{ marginBottom: 30 }}>
        <Link href="/dashboard">← Все проекты</Link>
      </div>

      <h1>{project.name}</h1>


      <ProjectSummaryView projectId={project.id} summary={summary} />

      <details
        style={{
          marginTop: 30,
          padding: "14px 24px",
          border: "1px solid var(--border)",
          borderRadius: 12,
        }}
      >
        <summary style={{ cursor: "pointer", fontSize: 20, fontWeight: 600 }}>
          Информация о проекте
          <span style={{ marginLeft: 10, fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>
            {project.name}
            {project.genre ? ` · ${project.genre}` : ""} — нажмите, чтобы раскрыть
          </span>
        </summary>

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
      </details>

      <details style={{ marginTop: 30, padding: "14px 24px", border: "1px solid var(--border)", borderRadius: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 20, fontWeight: 600 }}>
          Все разделы
          <span style={{ marginLeft: 10, fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>
            те же ссылки, что в верхней навигации — нажмите, чтобы раскрыть
          </span>
        </summary>

      <section
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {/* Lore Library */}
        <Link
          href={`/projects/${project.id}/lore`}
          style={{
            display: "block",
            padding: 24,
            border: "1px solid var(--border)",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "var(--surface)",
          }}
        >
          <h2>📚 Материалы мира</h2>
          <p>Исходные заметки, технологии, локации, культура и история мира.</p>
          <strong>Открыть библиотеку →</strong>
        </Link>

        {/* Canon */}
        <Link
          href={`/projects/${project.id}/canon`}
          style={{
            display: "block",
            padding: 24,
            border: "1px solid var(--border)",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "var(--surface)",
          }}
        >
          <h2>📖 Canon</h2>
          <p>Все подтверждённые факты проекта с цитатами и источником.</p>
          <strong>Открыть Canon →</strong>
        </Link>

        {/* Сюжетная карта */}
        <Link
          href={`/projects/${project.id}/plot-map`}
          style={{
            display: "block",
            padding: 24,
            border: "1px solid var(--border)",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "var(--surface)",
          }}
        >
          <h2>🗺️ Сюжетная карта</h2>
          <p>Замысел книги, будущие вехи и тайны с планом раскрытия.</p>
          <strong>Открыть карту →</strong>
        </Link>

        {/* Экспорт */}
        <Link
          href={`/projects/${project.id}/export`}
          style={{
            display: "block",
            padding: 24,
            border: "1px solid var(--border)",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "var(--surface)",
          }}
        >
          <h2>📄 Экспорт в PDF</h2>
          <p>Написанные главы в виде книги: печать или сохранение в PDF.</p>
          <strong>Открыть экспорт →</strong>
        </Link>

        {/* Расходы ИИ */}
        <Link
          href="/ai-usage"
          style={{
            display: "block",
            padding: 24,
            border: "1px solid var(--border)",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "var(--surface)",
          }}
        >
          <h2>💰 Расходы ИИ</h2>
          <p>Траты по функциям, моделям, дням и проектам. Месячный лимит.</p>
          <strong>Открыть расходы →</strong>
        </Link>

        {/* Story Bible */}
        <Link
          href={`/projects/${project.id}/story-bible`}
          style={{
            display: "block",
            padding: 24,
            border: "1px solid var(--border)",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "var(--surface)",
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
            border: "1px solid var(--border)",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "var(--surface-2)",
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
            border: "1px solid var(--border)",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "var(--surface)",
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
            border: "1px solid var(--border)",
            borderRadius: 12,
            textDecoration: "none",
            color: "inherit",
            background: "var(--surface)",
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
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 24,
            background: "var(--surface)",
            transition: "0.2s",
          }}
        >
          <h2 style={{ marginTop: 0 }}>📚 Chapters</h2>

          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
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
            border: "1px solid var(--violet-border)",
            borderRadius: 14,
            padding: 24,
            background: "var(--violet-bg)",
            transition: "0.2s",
          }}
        >
          <h2 style={{ marginTop: 0 }}>🧠 Memory</h2>

          <p
            style={{
              color: "var(--muted)",
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
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 24,
            background: "var(--surface)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>🤝 Relationships</h2>

          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
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
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 24,
            background: "var(--surface)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>🧵 Plot Lines</h2>

          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
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
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 24,
            background: "var(--surface)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>🕰️ Timeline</h2>

          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            События истории в хронологическом порядке.
          </p>

          <strong>Открыть таймлайн →</strong>
        </Link>

        {/* Референсы */}
        <Link
          href={`/projects/${project.id}/references`}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 24,
            background: "var(--surface)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>🎨 Референсы</h2>

          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            Библиотека художественных приёмов, которые применяются при работе над главами.
          </p>

          <strong>Открыть референсы →</strong>
        </Link>
      </section>
      </details>
    </main>
  );
}