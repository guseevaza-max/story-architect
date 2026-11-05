import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnedProject } from "@/lib/plotMap/access";

type Ctx = { params: Promise<{ id: string }> };

/** Сюжетная карта книги: поля книги, вехи по порядку и тайны с планом раскрытия. */
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const owned = await requireOwnedProject(id);
    if (owned.error) return owned.error;

    const requested = Number(new URL(request.url).searchParams.get("bookNumber") ?? 1);
    const bookNumber = Number.isInteger(requested) && requested >= 1 ? requested : 1;

    const book = await prisma.book.findFirst({
      where: { projectId: id, number: bookNumber },
    });

    const [beats, secrets] = await Promise.all([
      prisma.plotBeat.findMany({
        where: { projectId: id, bookId: book?.id ?? null },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      }),
      prisma.secret.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return NextResponse.json({ ok: true, book, beats, secrets });
  } catch (error) {
    console.error("Plot map load error:", error);
    return NextResponse.json({ error: "Не удалось загрузить сюжетную карту" }, { status: 500 });
  }
}
