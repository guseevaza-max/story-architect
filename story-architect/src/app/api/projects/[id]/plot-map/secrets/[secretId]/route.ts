import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { definedOnly, revealOrderError, secretUpdateSchema } from "@/lib/plotMap/schema";
import { readJson, requireOwnedProject, validationResponse } from "@/lib/plotMap/access";

type Ctx = { params: Promise<{ id: string; secretId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id, secretId } = await params;
    const owned = await requireOwnedProject(id);
    if (owned.error) return owned.error;

    const secret = await prisma.secret.findFirst({ where: { id: secretId, projectId: id } });
    if (!secret) return NextResponse.json({ error: "Тайна не найдена" }, { status: 404 });

    const parsed = secretUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationResponse(parsed.error);

    const data = definedOnly(parsed.data);

    // Порядок «намёки → частично → полностью» проверяется вместе с сохранёнными значениями.
    const orderError = revealOrderError({
      hintFromChapter: "hintFromChapter" in data ? data.hintFromChapter : secret.hintFromChapter,
      partialRevealChapter:
        "partialRevealChapter" in data ? data.partialRevealChapter : secret.partialRevealChapter,
      plannedRevealChapter:
        "plannedRevealChapter" in data ? data.plannedRevealChapter : secret.plannedRevealChapter,
    });
    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 400 });

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Нет данных для сохранения" }, { status: 400 });
    }

    const updated = await prisma.secret.update({ where: { id: secret.id }, data });
    return NextResponse.json({ ok: true, secret: updated });
  } catch (error) {
    console.error("Secret update error:", error);
    return NextResponse.json({ error: "Не удалось сохранить тайну" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, secretId } = await params;
    const owned = await requireOwnedProject(id);
    if (owned.error) return owned.error;

    const result = await prisma.secret.deleteMany({ where: { id: secretId, projectId: id } });
    if (result.count === 0) return NextResponse.json({ error: "Тайна не найдена" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Secret delete error:", error);
    return NextResponse.json({ error: "Не удалось удалить тайну" }, { status: 500 });
  }
}
