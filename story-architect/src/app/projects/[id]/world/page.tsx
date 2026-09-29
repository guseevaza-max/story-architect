import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

export default async function WorldPage({
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
    select: {
      id: true,
      name: true,
    },
  });

  if (!project) {
    notFound();
  }

  const worldEntities = await prisma.worldEntity.findMany({
    where: {
      projectId: project.id,
      status: "CANON",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const worldRules = await prisma.worldRule.findMany({
    where: {
      projectId: project.id,
      status: "CANON",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

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
        <Link href={`/projects/${project.id}`}>
          ← Назад в проект
        </Link>
      </div>

      <h1>🌍 World</h1>

      <p style={{ color: "#666", fontSize: 18 }}>
        Мир проекта {project.name}
      </p>

      <section
        style={{
          marginTop: 30,
          padding: 24,
          border: "1px solid #ddd",
          borderRadius: 12,
        }}
      >
        <h2>Мир и сущности</h2>

        {worldEntities.length === 0 ? (
          <p style={{ color: "#666" }}>
            Пока нет элементов мира, принятых в Canon.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
              marginTop: 20,
            }}
          >
            {worldEntities.map((entity) => (
              <article
                key={entity.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 20,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <h3 style={{ margin: 0 }}>
                    {entity.name}
                  </h3>

                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: 20,
                      background: "#e8f5e9",
                      color: "#26733a",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    CANON
                  </span>
                </div>

                {entity.type && (
                  <p
                    style={{
                      marginTop: 10,
                      color: "#666",
                    }}
                  >
                    <strong>Тип:</strong> {entity.type}
                  </p>
                )}

                {entity.description && (
                  <p
                    style={{
                      color: "#555",
                      lineHeight: 1.6,
                    }}
                  >
                    {entity.description}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        style={{
          marginTop: 30,
          padding: 24,
          border: "1px solid #ddd",
          borderRadius: 12,
        }}
      >
        <h2>⚙️ Правила мира</h2>

        {worldRules.length === 0 ? (
          <p style={{ color: "#666" }}>
            Пока нет правил мира, принятых в Canon.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 16,
              marginTop: 20,
            }}
          >
            {worldRules.map((rule) => (
              <article
                key={rule.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 20,
                  background: "#fff",
                }}
              >
                <h3 style={{ marginTop: 0 }}>
                  {rule.name}
                </h3>

                <p>
                  <strong>Правило:</strong>{" "}
                  {rule.statement}
                </p>

                {rule.explanation && (
                  <p
                    style={{
                      color: "#555",
                      lineHeight: 1.6,
                    }}
                  >
                    {rule.explanation}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}