import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reorderSchema } from "@/lib/plotMap/schema";
import { readJson, requireOwnedProject, validationResponse } from "@/lib/plotMap/access";

type Ctx = { params: Promise<{ id: string }> };

/** Новый порядок вех: ids в нужной последовательности. Все ids должны быть из этого проекта. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const owned = await requireOwnedProject(id);
    if (owned.error) return owned.error;

    const parsed = reorderSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationResponse(parsed.error);

    const { ids } = parsed.data;

    const found = await prisma.plotBeat.findMany({
      where: { projectId: id, id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      return NextResponse.json({ error: "Среди вех есть чужие или удалённые" }, { status: 400 });
    }

    await prisma.$transaction(
      ids.map((beatId, index) =>
        prisma.plotBeat.update({ where: { id: beatId }, data: { order: index } })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Plot beat reorder error:", error);
    return NextResponse.json({ error: "Не удалось изменить порядок" }, { status: 500 });
  }
}
