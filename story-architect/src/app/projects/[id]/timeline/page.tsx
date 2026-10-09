import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  EmptyState,
  PageShell,
  Pill,
  cardStyle,
} from "../_components/PageShell";

export default async function TimelinePage({
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
    where: { id, userId: session.user.id },
    select: { id: true, name: true },
  });

  if (!project) {
    notFound();
  }

  const found = await prisma.event.findMany({
    where: { projectId: project.id, status: "CANON" },
    include: {
      effectLinks: {
        include: { effectEvent: { select: { name: true } } },
      },
    },
  });

  // Порядок: ось времени вселенной, затем глава, затем создание.
  // События без даты и главы уходят в конец.
  const events = [...found].sort((a, b) => {
    const byTime =
      (a.timeIndex ?? Number.POSITIVE_INFINITY) -
      (b.timeIndex ?? Number.POSITIVE_INFINITY);
    if (Number.isFinite(byTime) && byTime !== 0) return byTime;

    const byChapter =
      (a.chapterNumber ?? Number.POSITIVE_INFINITY) -
      (b.chapterNumber ?? Number.POSITIVE_INFINITY);
    if (Number.isFinite(byChapter) && byChapter !== 0) return byChapter;

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return (
    <PageShell
      projectId={project.id}
      title="Timeline"
      subtitle={`События проекта ${project.name}`}
      badge={`${events.length} событий`}
    >
      {events.length === 0 ? (
        <EmptyState
          icon="🕰️"
          title="Пока нет событий"
          text="События появятся здесь после принятия AI-предложений в Canon."
          href={`/projects/${project.id}/proposals`}
          linkLabel="Открыть предложения AI"
        />
      ) : (
        <div style={{ borderLeft: "3px solid #ddd", paddingLeft: 24 }}>
          {events.map((event) => (
            <article
              key={event.id}
              style={{ ...cardStyle, marginBottom: 20 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ margin: 0 }}>{event.name}</h2>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Pill
                    text={event.inWorldDate ?? "дата неизвестна"}
                    tone={event.inWorldDate ? "blue" : "amber"}
                  />
                  {event.chapterNumber !== null && (
                    <Pill text={`глава ${event.chapterNumber}`} />
                  )}
                </div>
              </div>

              {event.description && (
                <p style={{ color: "#555", lineHeight: 1.6 }}>
                  {event.description}
                </p>
              )}

              {event.cause && (
                <p>
                  <strong>Причина:</strong> {event.cause}
                </p>
              )}

              {event.consequences && (
                <p>
                  <strong>Последствия:</strong> {event.consequences}
                </p>
              )}

              {event.effectLinks.length > 0 && (
                <p style={{ color: "#777", fontSize: 14, marginBottom: 0 }}>
                  Привело к:{" "}
                  {event.effectLinks
                    .map((link) => link.effectEvent.name)
                    .join(", ")}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
