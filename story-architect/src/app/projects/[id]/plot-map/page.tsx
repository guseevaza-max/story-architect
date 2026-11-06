import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import PlotMapClient from "./PlotMapClient";

export default async function PlotMapPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <Link href={`/projects/${project.id}`}>← К проекту</Link>
      <h1>🗺️ Сюжетная карта</h1>
      <p style={{ color: "var(--text-2)" }}>
        Замысел книги, будущие вехи и тайны. Всё это заполняет только автор: ИИ карту не меняет.
        Номер главы указывать не обязательно.
      </p>
      <PlotMapClient projectId={project.id} />
    </main>
  );
}
