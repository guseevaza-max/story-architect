import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { beatCreateSchema } from "@/lib/plotMap/schema";
import { readJson, requireOwnedProject, validationResponse } from "@/lib/plotMap/access";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = beatCreateSchema.and(
  z.object({ bookNumber: z.number().int().min(1).max(50).default(1) })
);

/** Новая веха добавляется в конец списка. Номер главы не обязателен. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const owned = await requireOwnedProject(id);
    if (owned.error) return owned.error;

    const parsed = createSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationResponse(parsed.error);

    const { bookNumber, ...fields } = parsed.data;

    let book = await prisma.book.findFirst({
      where: { projectId: id, number: bookNumber },
      select: { id: true },
    });
    if (!book) {
      book = await prisma.book.create({
        data: { projectId: id, number: bookNumber, title: `Книга ${bookNumber}` },
        select: { id: true },
      });
    }

    const last = await prisma.plotBeat.findFirst({
      where: { projectId: id, bookId: book.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const beat = await prisma.plotBeat.create({
      data: { projectId: id, bookId: book.id, order: (last?.order ?? -1) + 1, ...fields },
    });

    return NextResponse.json({ ok: true, beat }, { status: 201 });
  } catch (error) {
    console.error("Plot beat create error:", error);
    return NextResponse.json({ error: "Не удалось создать веху" }, { status: 500 });
  }
}
