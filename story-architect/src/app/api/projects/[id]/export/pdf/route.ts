import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnedProject } from "@/lib/plotMap/access";
import { parseExportQuery, selectChapters } from "@/lib/export/chapters";
import { buildBookPdf } from "@/lib/export/pdf";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Скачать главы проекта одним PDF-файлом. Только чтение, Canon не затрагивается. */
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const owned = await requireOwnedProject(id);
    if (owned.error) return owned.error;

    const url = new URL(request.url);
    const query = parseExportQuery(Object.fromEntries(url.searchParams));

    const project = await prisma.project.findFirst({ where: { id }, select: { name: true } });
    const book = await prisma.book.findFirst({
      where: { projectId: id },
      orderBy: { number: "asc" },
      select: {
        title: true,
        chapters: { select: { number: true, title: true, status: true, draftText: true, finalText: true } },
      },
    });

    const chapters = selectChapters(book?.chapters ?? [], query);
    if (chapters.length === 0) {
      return NextResponse.json({ error: "Нет глав с текстом для экспорта" }, { status: 404 });
    }

    const title = book?.title || project?.name || "Книга";
    const pdf = await buildBookPdf(title, chapters);
    const fileName = `${title}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="book.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PDF export error:", error);
    return NextResponse.json({ error: "Не удалось собрать PDF" }, { status: 500 });
  }
}
