import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  EmptyState,
  PageShell,
  Pill,
  cardStyle,
} from "../_components/PageShell";

const STATUS_TONE = {
  ACTIVE: "green",
  DORMANT: "amber",
  RESOLVED: "blue",
  ABANDONED: "gray",
  UNKNOWN: "gray",
} as const;

export default async function PlotLinesPage({
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

  const plotLines = await prisma.plotLine.findMany({
    where: { projectId: project.id, status: "CANON" },
    include: { stages: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <PageShell
      projectId={project.id}
      title="Plot Lines"
      subtitle={`Сюжетные линии проекта ${project.name}`}
      badge={`${plotLines.length} линий`}
    >
      {plotLines.length === 0 ? (
        <EmptyState
          icon="🧵"
          title="Пока нет сюжетных линий"
          text="Сюжетные линии появятся здесь после принятия AI-предложений в Canon."
          href={`/projects/${project.id}/proposals`}
          linkLabel="Открыть предложения AI"
        />
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          {plotLines.map((line) => (
            <article key={line.id} style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <h2 style={{ margin: 0 }}>{line.name}</h2>
                <Pill
                  text={line.plotStatus}
                  tone={STATUS_TONE[line.plotStatus]}
                />
              </div>

              {line.premise && (
                <p style={{ color: "#555", lineHeight: 1.6 }}>
                  {line.premise}
                </p>
              )}

              {line.objective && (
                <p>
                  <strong>Цель:</strong> {line.objective}
                </p>
              )}

              {line.currentState && (
                <p>
                  <strong>Сейчас:</strong> {line.currentState}
                </p>
              )}

              {line.actualProgress && (
                <p>
                  <strong>Фактический прогресс:</strong>{" "}
                  {line.actualProgress}
                </p>
              )}

              {line.plannedResolution && (
                <p>
                  <strong>Планируемая развязка:</strong>{" "}
                  {line.plannedResolution}
                </p>
              )}

              <p style={{ color: "#777", fontSize: 14 }}>
                {line.lastProgressChapter !== null
                  ? `Последний прогресс: глава ${line.lastProgressChapter}`
                  : "Прогресса по линии пока не зафиксировано"}
              </p>

              {line.stages.length > 0 && (
                <>
                  <h3 style={{ marginBottom: 8 }}>Этапы</h3>
                  <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.7 }}>
                    {line.stages.map((stage) => (
                      <li key={stage.id}>
                        <strong>{stage.name}</strong>
                        {stage.description ? ` — ${stage.description}` : ""}
                        <span style={{ color: "#777", fontSize: 14 }}>
                          {stage.plannedChapter !== null
                            ? ` · план: глава ${stage.plannedChapter}`
                            : ""}
                          {stage.actualChapter !== null
                            ? ` · факт: глава ${stage.actualChapter}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
