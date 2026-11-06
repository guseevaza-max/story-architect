import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  CANON_SOURCES,
  CANON_SOURCE_LABELS,
  canonFactWhere,
  evidenceFromPayload,
  parseCanonQuery,
} from "@/lib/canon/list";

export default async function CanonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const query = parseCanonQuery(await searchParams);

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const facts = await prisma.canonFact.findMany({
    where: canonFactWhere(project.id, query),
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      statement: true,
      negation: true,
      importance: true,
      canonLevel: true,
      factSource: true,
      confidence: true,
      sourceProposalId: true,
      createdAt: true,
    },
  });

  const proposalIds = facts
    .map((f) => f.sourceProposalId)
    .filter((v): v is string => Boolean(v));
  const proposals = proposalIds.length
    ? await prisma.proposal.findMany({
        where: { id: { in: proposalIds }, projectId: project.id },
        select: { id: true, payload: true },
      })
    : [];
  const evidence = new Map(
    proposals.map((p) => [p.id, evidenceFromPayload(p.payload)])
  );

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
        <Link href={`/projects/${project.id}`}>← Назад в проект</Link>
      </div>

      <h1>📖 Canon</h1>
      <p style={{ color: "var(--muted)", fontSize: 18 }}>
        Подтверждённые факты проекта {project.name}: {facts.length}
        {facts.length === 500 ? " (показаны первые 500)" : ""}
      </p>

      <form
        method="get"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}
      >
        <input
          name="q"
          defaultValue={query.q}
          placeholder="Поиск по тексту факта"
          style={{ padding: 10, minWidth: 260, border: "1px solid var(--border)", borderRadius: 8 }}
        />
        <select
          name="source"
          defaultValue={query.source ?? ""}
          style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 8 }}
        >
          <option value="">Любой источник</option>
          {CANON_SOURCES.map((s) => (
            <option key={s} value={s}>
              {CANON_SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        <button type="submit" style={{ padding: "10px 18px", borderRadius: 8 }}>
          Найти
        </button>
        {(query.q || query.source) && (
          <Link
            href={`/projects/${project.id}/canon`}
            style={{ alignSelf: "center" }}
          >
            Сбросить
          </Link>
        )}
      </form>

      {facts.length === 0 ? (
        <p style={{ color: "var(--muted)", marginTop: 30 }}>
          {query.q || query.source
            ? "По этому запросу ничего не найдено."
            : "Пока нет фактов, принятых в Canon."}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
          {facts.map((fact) => {
            const ev = fact.sourceProposalId
              ? evidence.get(fact.sourceProposalId)
              : null;
            return (
              <article
                key={fact.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 18,
                  background: "var(--surface)",
                }}
              >
                <p style={{ margin: 0, fontSize: 17 }}>
                  {fact.negation ? "🚫 " : ""}
                  {fact.statement}
                </p>
                {ev && (
                  <blockquote
                    style={{
                      margin: "12px 0 0",
                      paddingLeft: 12,
                      borderLeft: "3px solid var(--border)",
                      color: "var(--text-2)",
                      fontSize: 14,
                    }}
                  >
                    «{ev.quote}»
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      Материал: {ev.materialTitle}
                    </div>
                  </blockquote>
                )}
                <p style={{ margin: "12px 0 0", color: "var(--muted)", fontSize: 13 }}>
                  {CANON_SOURCE_LABELS[fact.factSource]} ·{" "}
                  {fact.canonLevel === "HARD" ? "жёсткий закон" : "мягкая норма"} ·
                  важность {fact.importance}
                  {fact.confidence != null
                    ? ` · уверенность ${Math.round(fact.confidence * 100)}%`
                    : ""}{" "}
                  · {fact.createdAt.toLocaleDateString("ru-RU")}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
