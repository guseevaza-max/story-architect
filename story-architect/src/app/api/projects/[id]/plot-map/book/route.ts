import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { bookFieldsSchema } from "@/lib/plotMap/schema";
import { readJson, requireOwnedProject, validationResponse } from "@/lib/plotMap/access";

type Ctx = { params: Promise<{ id: string }> };

/** Общий замысел книги. Книга создаётся при первом сохранении, если её ещё нет. */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const owned = await requireOwnedProject(id);
    if (owned.error) return owned.error;

    const parsed = bookFieldsSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationResponse(parsed.error);

    const { bookNumber, ...fields } = parsed.data;

    const existing = await prisma.book.findFirst({
      where: { projectId: id, number: bookNumber },
      select: { id: true },
    });

    const book = existing
      ? await prisma.book.update({ where: { id: existing.id }, data: fields })
      : await prisma.book.create({
          data: { projectId: id, number: bookNumber, title: `Книга ${bookNumber}`, ...fields },
        });

    return NextResponse.json({ ok: true, book });
  } catch (error) {
    console.error("Plot map book save error:", error);
    return NextResponse.json({ error: "Не удалось сохранить замысел книги" }, { status: 500 });
  }
}
