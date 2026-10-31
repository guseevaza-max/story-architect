import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  normalizeReferences,
  referenceLibraryInputSchema,
  type AuthorReference,
} from "@/lib/authorIntent/schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function loadProject(id: string, userId: string) {
  return prisma.project.findFirst({
    where: { id, userId },
    select: { id: true, authorReferences: true },
  });
}

/** Библиотека авторских референсов проекта. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const project = await loadProject(id, session.user.id);

    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    return NextResponse.json({
      references: normalizeReferences(project.authorReferences),
    });
  } catch (error) {
    console.error("References load error:", error);

    return NextResponse.json(
      { error: "Не удалось загрузить референсы." },
      { status: 500 }
    );
  }
}

/** Сохраняет библиотеку целиком. Canon не затрагивает. */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const project = await loadProject(id, session.user.id);

    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    const body: unknown = await request.json().catch(() => null);
    const raw =
      body && typeof body === "object"
        ? (body as { references?: unknown }).references
        : undefined;

    const parsed = referenceLibraryInputSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Некорректные данные референсов." },
        { status: 400 }
      );
    }

    // Идентификаторы выдаёт сервер, дубликаты не допускаются.
    const seen = new Set<string>();
    const references: AuthorReference[] = parsed.data.map((item) => {
      let referenceId = item.id ?? randomUUID();

      if (seen.has(referenceId)) referenceId = randomUUID();
      seen.add(referenceId);

      return { ...item, id: referenceId };
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { authorReferences: references as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({ ok: true, references });
  } catch (error) {
    console.error("References save error:", error);

    return NextResponse.json(
      { error: "Не удалось сохранить референсы." },
      { status: 500 }
    );
  }
}
