import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { beatRangeError, beatUpdateSchema, definedOnly } from "@/lib/plotMap/schema";
import { readJson, requireOwnedProject, validationResponse } from "@/lib/plotMap/access";

type Ctx = { params: Promise<{ id: string; beatId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id, beatId } = await params;
    const owned = await requireOwnedProject(id);
    if (owned.error) return owned.error;

    const beat = await prisma.plotBeat.findFirst({ where: { id: beatId, projectId: id } });
    if (!beat) return NextResponse.json({ error: "Веха не найдена" }, { status: 404 });

    const parsed = beatUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationResponse(parsed.error);

    const data = definedOnly(parsed.data);

    // Диапазон глав проверяется вместе с сохранёнными значениями.
    const rangeError = beatRangeError(
      "plannedChapterFrom" in data ? data.plannedChapterFrom : beat.plannedChapterFrom,
      "plannedChapterTo" in data ? data.plannedChapterTo : beat.plannedChapterTo
    );
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Нет данных для сохранения" }, { status: 400 });
    }

    const updated = await prisma.plotBeat.update({ where: { id: beat.id }, data });
    return NextResponse.json({ ok: true, beat: updated });
  } catch (error) {
    console.error("Plot beat update error:", error);
    return NextResponse.json({ error: "Не удалось сохранить веху" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, beatId } = await params;
    const owned = await requireOwnedProject(id);
    if (owned.error) return owned.error;

    const result = await prisma.plotBeat.deleteMany({ where: { id: beatId, projectId: id } });
    if (result.count === 0) return NextResponse.json({ error: "Веха не найдена" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Plot beat delete error:", error);
    return NextResponse.json({ error: "Не удалось удалить веху" }, { status: 500 });
  }
}
