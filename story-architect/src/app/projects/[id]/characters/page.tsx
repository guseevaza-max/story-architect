import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

export default async function CharactersPage({
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

  const characters = await prisma.character.findMany({
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

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 30,
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 8px" }}>
            Characters
          </h1>

          <p
            style={{
              margin: 0,
              color: "#666",
              fontSize: 18,
            }}
          >
            Персонажи проекта {project.name}
          </p>
        </div>

        <div
          style={{
            padding: "10px 16px",
            borderRadius: 20,
            background: "#f3f4f6",
            fontWeight: 600,
          }}
        >
          {characters.length} персонажей
        </div>
      </div>

      {characters.length === 0 ? (
        <section
          style={{
            padding: 50,
            border: "1px solid #ddd",
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 48,
              marginBottom: 15,
            }}
          >
            👤
          </div>

          <h2>Пока нет персонажей</h2>

          <p style={{ color: "#666" }}>
            Персонажи появятся здесь после принятия
            AI-предложений в Canon.
          </p>

          <Link
            href={`/projects/${project.id}/proposals`}
            style={{
              display: "inline-block",
              marginTop: 16,
              padding: "12px 20px",
              borderRadius: 8,
              background: "#111",
              color: "#fff",
              textDecoration: "none",
            }}
          >
            Открыть предложения AI
          </Link>
        </section>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 20,
          }}
        >
          {characters.map((character) => (
            <article
              key={character.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 24,
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 15,
                }}
              >
                <h2 style={{ margin: 0 }}>
                  {character.name}
                </h2>

                <span
                  style={{
                    padding: "5px 9px",
                    borderRadius: 20,
                    background: "#e8f5e9",
                    color: "#26733a",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  CANON
                </span>
              </div>

              {character.role && (
                <p style={{ marginTop: 12 }}>
                  <strong>Роль:</strong>{" "}
                  {character.role}
                </p>
              )}

              {character.description && (
                <p
                  style={{
                    color: "#555",
                    lineHeight: 1.6,
                  }}
                >
                  {character.description}
                </p>
              )}

              {character.personality && (
                <p>
                  <strong>Характер:</strong>{" "}
                  {character.personality}
                </p>
              )}

              {character.goals && (
                <p>
                  <strong>Цели:</strong>{" "}
                  {character.goals}
                </p>
              )}

              {character.abilities &&
                typeof character.abilities === "object" && (
                  <p>
                    <strong>Способности:</strong> есть
                  </p>
                )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}