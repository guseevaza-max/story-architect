import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import CreateChapterForm from "./CreateChapterForm";

const prisma = new PrismaClient();

export default async function ChaptersPage({
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
    include: {
      books: {
        orderBy: {
          number: "asc",
        },
        include: {
          chapters: {
            orderBy: {
              number: "asc",
            },
          },
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const chapters = project.books.flatMap((book) =>
    book.chapters.map((chapter) => ({
      ...chapter,
      bookNumber: book.number,
    }))
  );

  const statusLabels: Record<string, string> = {
    IDEA: "Идея",
    PLANNED: "Запланирована",
    DRAFT: "Черновик",
    EDITING: "Редактирование",
    CHECKING: "Проверка",
    APPROVED: "Утверждена",
    CANON: "Canon",
  };

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: "32px 20px 60px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <Link
          href={`/projects/${project.id}`}
          style={{
            color: "#555",
            textDecoration: "none",
          }}
        >
          ← Назад к проекту
        </Link>
      </div>

      <div style={{ marginBottom: 30 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 34,
          }}
        >
          Главы
        </h1>

        <p
          style={{
            marginTop: 10,
            color: "#666",
            lineHeight: 1.6,
          }}
        >
          Здесь создаются и развиваются главы истории.
        </p>
      </div>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: 18,
          }}
        >
          Создать главу
        </h2>

        <CreateChapterForm projectId={project.id} />
      </section>

      <section>
        <h2
          style={{
            marginBottom: 16,
          }}
        >
          Список глав
        </h2>

        {chapters.length === 0 ? (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 14,
              padding: 24,
              color: "#666",
            }}
          >
            Пока нет ни одной главы.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {chapters.map((chapter) => (
              <Link
                key={chapter.id}
                href={`/projects/${project.id}/chapters/${chapter.id}`}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  border: "1px solid #ddd",
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 20,
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "#777",
                        fontSize: 13,
                        marginBottom: 6,
                      }}
                    >
                      Книга {chapter.bookNumber} · Глава{" "}
                      {chapter.number}
                    </div>

                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 600,
                        marginBottom: 8,
                      }}
                    >
                      {chapter.title || "Без названия"}
                    </div>

                    <div
                      style={{
                        color: "#666",
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      {chapter.purpose ||
                        "Назначение главы пока не указано."}
                    </div>
                  </div>

                  <div
                    style={{
                      flexShrink: 0,
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: "#fef3c7",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {statusLabels[chapter.status] ||
                      chapter.status}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}