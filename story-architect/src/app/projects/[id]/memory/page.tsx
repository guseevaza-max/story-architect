import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";

const prisma = new PrismaClient();

const typeLabels: Record<
  string,
  {
    title: string;
    icon: string;
  }
> = {
  CHARACTER_CHANGE: {
    title: "Персонажи",
    icon: "👤",
  },

  RELATIONSHIP_CHANGE: {
    title: "Отношения",
    icon: "🤝",
  },

  EVENT: {
    title: "События",
    icon: "⚔️",
  },

  WORLD_CHANGE: {
    title: "Мир",
    icon: "🌍",
  },

  SECRET: {
    title: "Тайны",
    icon: "🔐",
  },

  FORESHADOWING: {
    title: "Foreshadowing",
    icon: "🔮",
  },

  QUESTION: {
    title: "Открытые вопросы",
    icon: "❓",
  },

  PLOT_PROGRESS: {
    title: "Сюжет",
    icon: "🎯",
  },

  NEW_ENTITY: {
    title: "Новые сущности",
    icon: "🆕",
  },

  FACT: {
    title: "Факты",
    icon: "📌",
  },
};

export default async function MemoryPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
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

  const summaries =
    await prisma.chapterSummary.findMany({
      where: {
        chapter: {
          book: {
            projectId: project.id,
          },
        },
      },

      include: {
        chapter: {
          select: {
            id: true,
            number: true,
            title: true,
          },
        },
      },

      orderBy: {
        chapter: {
          number: "asc",
        },
      },
    });

  const memoryChunks =
    await prisma.memoryChunk.findMany({
      where: {
        projectId: project.id,
      },

      include: {
        chapter: {
          select: {
            id: true,
            number: true,
            title: true,
          },
        },
      },

      orderBy: {
        createdAt: "asc",
      },
    });

  const groupedMemory: Record<
    string,
    typeof memoryChunks
  > = {};

  for (const chunk of memoryChunks) {
    const metadata =
      chunk.metadata &&
      typeof chunk.metadata === "object"
        ? (chunk.metadata as Record<
            string,
            unknown
          >)
        : null;

    const type =
      typeof metadata?.type === "string"
        ? metadata.type
        : "FACT";

    if (!groupedMemory[type]) {
      groupedMemory[type] = [];
    }

    groupedMemory[type].push(chunk);
  }

  const orderedTypes = [
    "CHARACTER_CHANGE",
    "RELATIONSHIP_CHANGE",
    "EVENT",
    "WORLD_CHANGE",
    "SECRET",
    "FORESHADOWING",
    "QUESTION",
    "PLOT_PROGRESS",
    "NEW_ENTITY",
    "FACT",
  ];

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "40px auto",
        padding: "0 24px 60px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <Link
        href={`/projects/${project.id}`}
        style={{
          display: "inline-block",
          marginBottom: 20,
          color: "#555",
          textDecoration: "none",
        }}
      >
        ← Назад к проекту
      </Link>

      <h1
        style={{
          fontSize: 32,
          marginBottom: 8,
        }}
      >
        🧠 Memory
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: 28,
        }}
      >
        Подтверждённая память проекта{" "}
        <strong>{project.name}</strong>.
      </p>

      {/* =====================================================
          SUMMARY
          ===================================================== */}

      <section
        style={{
          border: "2px solid #93c5fd",
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
          background: "#eff6ff",
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: 18,
          }}
        >
          📚 Резюме глав
        </h2>

        {summaries.length === 0 ? (
          <p style={{ color: "#666" }}>
            Пока нет сохранённых резюме глав.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {summaries.map((summary) => (
              <article
                key={summary.id}
                style={{
                  background: "#fff",
                  border: "1px solid #dbeafe",
                  borderRadius: 10,
                  padding: 18,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#666",
                      }}
                    >
                      Глава{" "}
                      {summary.chapter.number}
                    </div>

                    <h3
                      style={{
                        margin: "4px 0 0",
                      }}
                    >
                      {summary.chapter.title ||
                        `Глава ${summary.chapter.number}`}
                    </h3>
                  </div>

                  <Link
                    href={`/projects/${project.id}/chapters/${summary.chapter.id}`}
                    style={{
                      fontSize: 13,
                      color: "#2563eb",
                      textDecoration:
                        "none",
                    }}
                  >
                    Открыть главу →
                  </Link>
                </div>

                <div
                  style={{
                    marginBottom: 14,
                  }}
                >
                  <strong>
                    Краткое резюме
                  </strong>

                  <p
                    style={{
                      lineHeight: 1.6,
                      marginBottom: 0,
                    }}
                  >
                    {summary.shortSummary}
                  </p>
                </div>

                {summary.fullSummary && (
                  <div
                    style={{
                      marginBottom: 14,
                    }}
                  >
                    <strong>
                      Полное резюме
                    </strong>

                    <p
                      style={{
                        lineHeight: 1.6,
                        whiteSpace:
                          "pre-wrap",
                        marginBottom: 0,
                      }}
                    >
                      {summary.fullSummary}
                    </p>
                  </div>
                )}

                {summary.worldDelta &&
                  typeof summary.worldDelta ===
                    "object" && (
                    <div>
                      <strong>
                        🌍 Изменения мира
                      </strong>

                      <pre
                        style={{
                          marginTop: 8,
                          padding: 14,
                          background:
                            "#f8fafc",
                          borderRadius: 8,
                          overflowX:
                            "auto",
                          fontSize: 13,
                          whiteSpace:
                            "pre-wrap",
                        }}
                      >
                        {JSON.stringify(
                          summary.worldDelta,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* =====================================================
          MEMORY
          ===================================================== */}

      <section
        style={{
          border: "2px solid #c9b7e8",
          borderRadius: 12,
          padding: 24,
          background: "#faf8ff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 8,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
              }}
            >
              🧩 Факты и изменения
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                color: "#666",
                lineHeight: 1.5,
              }}
            >
              Подтверждённые элементы
              памяти, которые AI извлёк
              из утверждённых глав.
            </p>
          </div>

          <div
            style={{
              padding: "7px 12px",
              borderRadius: 999,
              background: "#ede9fe",
              color: "#6b21a8",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {memoryChunks.length}{" "}
            {memoryChunks.length === 1
              ? "элемент"
              : memoryChunks.length < 5
              ? "элемента"
              : "элементов"}
          </div>
        </div>

        {memoryChunks.length === 0 ? (
          <p
            style={{
              color: "#666",
              marginTop: 24,
            }}
          >
            Пока нет сохранённых
            элементов памяти.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
              marginTop: 24,
            }}
          >
            {orderedTypes.map((type) => {
              const items =
                groupedMemory[type];

              if (!items?.length) {
                return null;
              }

              const info =
                typeLabels[type] || {
                  title: type,
                  icon: "📌",
                };

              return (
                <div key={type}>
                  <h3
                    style={{
                      margin: "0 0 12px",
                      fontSize: 18,
                    }}
                  >
                    {info.icon}{" "}
                    {info.title}
                  </h3>

                  <div
                    style={{
                      display: "flex",
                      flexDirection:
                        "column",
                      gap: 10,
                    }}
                  >
                    {items.map((chunk) => (
                      <article
                        key={chunk.id}
                        style={{
                          background: "#fff",
                          border:
                            "1px solid #ddd",
                          borderRadius: 10,
                          padding: 16,
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            lineHeight: 1.6,
                          }}
                        >
                          {chunk.content}
                        </p>

                        {chunk.chapter && (
                          <div
                            style={{
                              marginTop: 10,
                              fontSize: 12,
                              color: "#777",
                            }}
                          >
                            Источник:{" "}
                            <Link
                              href={`/projects/${project.id}/chapters/${chunk.chapter.id}`}
                              style={{
                                color:
                                  "#2563eb",
                                textDecoration:
                                  "none",
                              }}
                            >
                              Глава{" "}
                              {
                                chunk
                                  .chapter
                                  .number
                              }
                            </Link>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}