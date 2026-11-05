import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { exportText, parseExportQuery, selectChapters, toParagraphs } from "@/lib/export/chapters";
import PrintButton from "./PrintButton";

export default async function ExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const query = parseExportQuery(await searchParams);

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const book = await prisma.book.findFirst({
    where: { projectId: id },
    orderBy: { number: "asc" },
    select: {
      title: true,
      chapters: {
        select: { number: true, title: true, status: true, draftText: true, finalText: true },
      },
    },
  });

  const all = book?.chapters ?? [];
  const chapters = selectChapters(all, query);
  const skipped = all.length - all.filter((c) => exportText(c).length > 0).length;

  return (
    <>
      <style>{`
        .book { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; max-width: 680px; margin: 0 auto; }
        .book h2 { page-break-before: always; margin-top: 0; text-align: center; }
        .book h2:first-of-type { page-break-before: avoid; }
        .book p { text-indent: 1.5em; margin: 0 0 .4em; text-align: justify; white-space: pre-line; }
        @media print { .no-print { display: none !important; } main { padding: 0 !important; } }
      `}</style>
      <main style={{ padding: 24 }}>
        <div className="no-print" style={{ maxWidth: 680, margin: "0 auto 24px" }}>
          <Link href={`/projects/${project.id}`}>← К проекту</Link>
          <h1>Экспорт в PDF</h1>
          <p style={{ color: "#555" }}>
            Берётся финальный текст утверждённых глав, а для остальных — черновик. Кнопка «Скачать PDF» отдаёт готовый файл.
            Печать из браузера тоже доступна.
          </p>
          <form method="get" style={{ marginBottom: 12 }}>
            Главы с{" "}
            <input name="from" defaultValue={query.from ?? ""} size={3} /> по{" "}
            <input name="to" defaultValue={query.to ?? ""} size={3} />{" "}
            <button type="submit">Показать</button>
          </form>
          <p>
            В экспорте глав: <strong>{chapters.length}</strong>
            {skipped > 0 && ` (без текста пропущено: ${skipped})`}
          </p>
          {chapters.length > 0 && (
            <>
              <a
                href={`/api/projects/${project.id}/export/pdf?from=${query.from ?? ""}&to=${query.to ?? ""}`}
                style={{ display: "inline-block", padding: "8px 16px", border: "1px solid #333", borderRadius: 6, marginRight: 8, textDecoration: "none", color: "inherit" }}
              >
                ⬇️ Скачать PDF
              </a>
              <PrintButton />
            </>
          )}
        </div>

        <article className="book">
          <h1 style={{ textAlign: "center" }}>{book?.title ?? project.name}</h1>
          {chapters.map((c) => (
            <section key={c.number}>
              <h2>
                Глава {c.number}
                {c.title ? `. ${c.title}` : ""}
              </h2>
              {toParagraphs(exportText(c)).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </section>
          ))}
        </article>
      </main>
    </>
  );
}
