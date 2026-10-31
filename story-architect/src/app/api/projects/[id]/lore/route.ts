import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  title: z.string().trim().min(1, "Укажи название материала.").max(200),
  category: z.enum([
    "GENERAL", "STATE", "LOCATION", "TECHNOLOGY", "MATERIALS",
    "CULTURE", "CHARACTERS", "HISTORY", "RULES", "OTHER",
  ]),
  content: z.string().max(200000, "Максимум 200 000 символов."),
});

async function ownedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
}

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Необходима авторизация." }, { status: 401 });

    const { id } = await params;
    const project = await ownedProject(id, session.user.id);
    if (!project)
      return NextResponse.json({ error: "Проект не найден." }, { status: 404 });

    const materials = await prisma.loreMaterial.findMany({
      where: { projectId: project.id },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ materials });
  } catch (error) {
    console.error("Lore list error:", error);
    return NextResponse.json({ error: "Не удалось загрузить материалы." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Необходима авторизация." }, { status: 401 });

    const { id } = await params;
    const project = await ownedProject(id, session.user.id);
    if (!project)
      return NextResponse.json({ error: "Проект не найден." }, { status: 404 });

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные." }, { status: 400 });

    const material = await prisma.loreMaterial.create({
      data: { ...parsed.data, projectId: project.id },
    });
    return NextResponse.json({ material }, { status: 201 });
  } catch (error) {
    console.error("Lore create error:", error);
    return NextResponse.json({ error: "Не удалось создать материал." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Необходима авторизация." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const materialId = body && typeof body.id === "string" ? body.id : "";
    const parsed = schema.safeParse(body);

    if (!materialId || !parsed.success)
      return NextResponse.json({
        error: parsed.success ? "Не указан материал." : parsed.error.issues[0]?.message,
      }, { status: 400 });

    const project = await ownedProject(id, session.user.id);
    if (!project)
      return NextResponse.json({ error: "Проект не найден." }, { status: 404 });

    const exists = await prisma.loreMaterial.findFirst({
      where: { id: materialId, projectId: project.id },
      select: { id: true },
    });
    if (!exists)
      return NextResponse.json({ error: "Материал не найден." }, { status: 404 });

    const material = await prisma.loreMaterial.update({
      where: { id: materialId },
      data: parsed.data,
    });
    return NextResponse.json({ material });
  } catch (error) {
    console.error("Lore update error:", error);
    return NextResponse.json({ error: "Не удалось сохранить материал." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Необходима авторизация." }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const materialId = body && typeof body.id === "string" ? body.id : "";
    if (!materialId)
      return NextResponse.json({ error: "Не указан материал." }, { status: 400 });

    const project = await ownedProject(id, session.user.id);
    if (!project)
      return NextResponse.json({ error: "Проект не найден." }, { status: 404 });

    const exists = await prisma.loreMaterial.findFirst({
      where: { id: materialId, projectId: project.id },
      select: { id: true },
    });
    if (!exists)
      return NextResponse.json({ error: "Материал не найден." }, { status: 404 });

    await prisma.loreMaterial.delete({ where: { id: materialId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Lore delete error:", error);
    return NextResponse.json({ error: "Не удалось удалить материал." }, { status: 500 });
  }
}
