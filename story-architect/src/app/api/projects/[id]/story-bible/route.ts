import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { validateStoryBibleText } from "@/lib/storyBible/text";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Возвращает сохранённый исходный текст Story Bible проекта. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      select: { storyBibleText: true, storyBibleUpdatedAt: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    return NextResponse.json({
      text: project.storyBibleText ?? "",
      updatedAt: project.storyBibleUpdatedAt,
    });
  } catch (error) {
    console.error("Story Bible load error:", error);

    return NextResponse.json(
      { error: "Не удалось загрузить текст Story Bible." },
      { status: 500 }
    );
  }
}

/** Сохраняет исходный текст Story Bible. Canon не затрагивает. */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    const body: unknown = await request.json().catch(() => null);
    const rawText =
      body && typeof body === "object"
        ? (body as { text?: unknown }).text
        : undefined;

    const check = validateStoryBibleText(rawText);

    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        storyBibleText: check.text,
        storyBibleUpdatedAt: new Date(),
      },
      select: { storyBibleUpdatedAt: true },
    });

    return NextResponse.json({ ok: true, updatedAt: updated.storyBibleUpdatedAt });
  } catch (error) {
    console.error("Story Bible save error:", error);

    return NextResponse.json(
      { error: "Не удалось сохранить текст Story Bible." },
      { status: 500 }
    );
  }
}
