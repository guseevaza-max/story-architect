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

  // Пункты Memory Update, которые AI пометил как неуверенные или
  // конфликтующие: сохранены для решения автора, в Canon и в контекст
  // генераторов не попадают.
  const unconfirmedItems: {
    chapterNumber: number | null;
    type: string;
    title: string;
    content: string;
    safety: string;
  }[] = [];

  for (const chunk of memoryChunks) {
    const meta =
      chunk.metadata && typeof chunk.metadata === "object"
        ? (chunk.metadata as Record<string, unknown>)
        : null;

    if (meta?.source !== "MEMORY_UPDATE") continue;

    const unconfirmed = meta.unconfirmed;
    const pending =
      unconfirmed && typeof unconfirmed === "object"
        ? (unconfirmed as { updates?: unknown }).updates
        : null;

    if (!Array.isArray(pending)) continue;

    for (const raw of pending) {
      if (!raw || typeof raw !== "object") continue;

      const item = raw as Record<string, unknown>;

      unconfirmedItems.push({
        chapterNumber: chunk.chapter?.number ?? null,
        type: typeof item.type === "string" ? item.type : "FACT",
        title: typeof item.title === "string" ? item.title : "(без названия)",
        content: typeof item.content === "string" ? item.content : "",
        safety: typeof item.safety === "string" ? item.safety : "UNCERTAIN",
      });
    }
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
        fontFamily: "var(--font-ui), system-ui, sans-serif",
      }}
    >
      <Link
        href={`/projects/${project.id}`}
        style={{
          display: "inline-block",
          marginBottom: 20,
          color: "var(--text-2)",
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
          color: "var(--muted)",
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
          border: "2px solid var(--info-border)",
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
          background: "var(--info-bg)",
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
          <p style={{ color: "var(--muted)" }}>
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
                  background: "var(--surface)",
                  border: "1px solid var(--info-border)",
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
                        color: "var(--muted)",
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
                      color: "var(--info-text)",
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
                            "var(--info-bg)",
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

      {unconfirmedItems.length > 0 && (
        <section
          style={{
            border: "2px solid var(--warn-border)",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
            background: "var(--warn-bg)",
          }}
        >
          <h2 style={{ margin: 0 }}>⚠️ Ожидает вашего решения</h2>

          <p style={{ color: "var(--muted)", lineHeight: 1.5 }}>
            Эти пункты AI пометил как неуверенные или конфликтующие. Они
            сохранены, но НЕ считаются подтверждённым Canon и не передаются
            Architect, Writer и Continuity.
          </p>

          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            {unconfirmedItems.map((item, index) => (
              <li key={`${item.chapterNumber}-${index}`}>
                {item.chapterNumber !== null
                  ? `Глава ${item.chapterNumber} · `
                  : ""}
                [{typeLabels[item.type]?.title ?? item.type}] {item.title}
                {item.content ? ` — ${item.content}` : ""} ({item.safety})
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        style={{
          border: "2px solid var(--violet-border)",
          borderRadius: 12,
          padding: 24,
          background: "var(--violet-bg)",
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
                color: "var(--muted)",
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
              background: "var(--info-bg)",
              color: "var(--violet-text)",
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
              color: "var(--muted)",
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
                          background: "var(--surface)",
                          border:
                            "1px solid var(--border)",
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
                              color: "var(--muted)",
                            }}
                          >
                            Источник:{" "}
                            <Link
                              href={`/projects/${project.id}/chapters/${chunk.chapter.id}`}
                              style={{
                                color:
                                  "var(--info-text)",
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