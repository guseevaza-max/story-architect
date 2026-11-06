import type { ReactNode } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import CoauthorDock from "./_components/CoauthorDock";
import ProjectNav from "./_components/ProjectNav";

/**
 * Общая оболочка страниц проекта: навигация по разделам и панель Соавтора.
 * Права на данные проверяют сами страницы и API; здесь навигация лишь
 * показывается вошедшему владельцу проекта и ничего не меняет.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let showNav = false;
  let pending = 0;
  let chapters: { id: string; number: number; title: string | null; status: string; bookNumber: number }[] = [];
  try {
    const session = await auth();
    if (session?.user?.id) {
      const owned = await prisma.project.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
      if (owned) {
        showNav = true;
        pending = await prisma.proposal.count({ where: { projectId: id, status: "PENDING" } });
        const rows = await prisma.chapter.findMany({
          where: { book: { projectId: id } },
          select: { id: true, number: true, title: true, status: true, book: { select: { number: true } } },
          take: 1000,
        });
        chapters = rows.map((c) => ({ id: c.id, number: c.number, title: c.title, status: c.status, bookNumber: c.book.number }));
      }
    }
  } catch {
    // навигация не должна ломать страницу: без неё остаются прямые ссылки
  }

  return (
    <>
      {showNav ? (
        <ProjectNav projectId={id} pending={pending} chapters={chapters}>
          {children}
        </ProjectNav>
      ) : (
        children
      )}
      <CoauthorDock projectId={id} />
    </>
  );
}
