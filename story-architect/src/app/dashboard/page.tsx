import { PrismaClient } from "@prisma/client";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/app/components/LogoutButton";
const prisma = new PrismaClient();

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }
const userName = session.user.name || "Пользователь";
const userEmail = session.user.email || "";
  const projects = await prisma.project.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: {
      updatedAt: "desc",
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
      <h1>Story Architect</h1>
<div
  style={{
    marginTop: 16,
    marginBottom: 30,
    padding: 16,
    border: "1px solid #ddd",
    borderRadius: 10,
    background: "#f8f8f8",
  }}
>
  <strong>{userName}</strong>
  {userEmail && (
    <div style={{ color: "#666", marginTop: 4 }}>
      {userEmail}
    </div>
  )}
  <LogoutButton />
</div>
      <h2>Мои проекты</h2>

      {projects.length === 0 ? (
        <p>У вас пока нет проектов.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 16,
            marginTop: 24,
          }}
        >
          {projects.map((project) => (
            <div
              key={project.id}
              style={{
                border: "1px solid #ccc",
                borderRadius: 8,
                padding: 20,
              }}
            >
              <h3>{project.name}</h3>

              <p>
                <strong>Жанр:</strong>{" "}
                {project.genre || "Не указан"}
              </p>

              {project.premise && (
                <p>{project.premise}</p>
              )}

              <Link href={`/projects/${project.id}`}>
                Открыть проект →
              </Link>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 30 }}>
        <Link href="/">
          ← Создать новый проект
        </Link>
      </div>
    </main>
  );
}