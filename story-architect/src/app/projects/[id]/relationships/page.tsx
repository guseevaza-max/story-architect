import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  EmptyState,
  PageShell,
  Pill,
  cardStyle,
} from "../_components/PageShell";

export default async function RelationshipsPage({
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

  const relationships = await prisma.relationship.findMany({
    where: { projectId: project.id, status: "CANON" },
    include: {
      source: { select: { name: true } },
      target: { select: { name: true } },
    },
    orderBy: [{ validFromChapter: "asc" }, { createdAt: "asc" }],
  });

  const active = relationships.filter((r) => r.validToChapter === null);
  const history = relationships.filter((r) => r.validToChapter !== null);

  const renderCard = (r: (typeof relationships)[number], closed: boolean) => (
    <article
      key={r.id}
      style={{ ...cardStyle, opacity: closed ? 0.75 : 1 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>
          {r.source.name} → {r.target.name}
        </h3>
        <Pill text={r.relationType} tone={closed ? "gray" : "blue"} />
      </div>

      {r.reason && (
        <p style={{ color: "#555", lineHeight: 1.6 }}>{r.reason}</p>
      )}

      <p style={{ color: "#777", fontSize: 14, marginBottom: 0 }}>
        {r.validFromChapter !== null
          ? `С главы ${r.validFromChapter}`
          : "С начала истории"}
        {r.validToChapter !== null
          ? ` по главу ${r.validToChapter}`
          : " — действует сейчас"}
        {r.value !== null ? ` · сила: ${r.value}` : ""}
      </p>
    </article>
  );

  return (
    <PageShell
      projectId={project.id}
      title="Relationships"
      subtitle={`Отношения персонажей проекта ${project.name}`}
      badge={`${active.length} действующих`}
    >
      {relationships.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="Пока нет отношений"
          text="Отношения появятся здесь после принятия Memory Update утверждённой главы."
          href={`/projects/${project.id}/proposals`}
          linkLabel="Открыть предложения AI"
        />
      ) : (
        <>
          <h2>Действующие</h2>
          {active.length === 0 ? (
            <p style={{ color: "#666" }}>Действующих отношений нет.</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: 20,
              }}
            >
              {active.map((r) => renderCard(r, false))}
            </div>
          )}

          {history.length > 0 && (
            <>
              <h2 style={{ marginTop: 40 }}>История изменений</h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  gap: 20,
                }}
              >
                {history.map((r) => renderCard(r, true))}
              </div>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
