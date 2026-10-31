import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  authorIntentSchema,
  normalizeIntent,
  normalizeReferences,
} from "@/lib/authorIntent/schema";

type RouteContext = {
  params: Promise<{ id: string; chapterId: string }>;
};

async function loadChapter(
  projectId: string,
  chapterId: string,
  userId: string
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true, authorReferences: true },
  });

  if (!project) return null;

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, book: { projectId: project.id } },
    select: { id: true, authorIntent: true },
  });

  return chapter ? { project, chapter } : null;
}

/** Авторский замысел главы и библиотека референсов для выбора. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, chapterId } = await params;
    const found = await loadChapter(id, chapterId, session.user.id);

    if (!found) {
      return NextResponse.json({ error: "Глава не найдена" }, { status: 404 });
    }

    return NextResponse.json({
      intent: normalizeIntent(found.chapter.authorIntent),
      references: normalizeReferences(found.project.authorReferences),
    });
  } catch (error) {
    console.error("Author intent load error:", error);

    return NextResponse.json(
      { error: "Не удалось загрузить авторский замысел." },
      { status: 500 }
    );
  }
}

/** Сохраняет замысел главы. Canon и другие главы не затрагивает. */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, chapterId } = await params;
    const found = await loadChapter(id, chapterId, session.user.id);

    if (!found) {
      return NextResponse.json({ error: "Глава не найдена" }, { status: 404 });
    }

    const body: unknown = await request.json().catch(() => null);
    const raw =
      body && typeof body === "object"
        ? (body as { intent?: unknown }).intent
        : undefined;

    const parsed = authorIntentSchema.safeParse(raw ?? {});

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Некорректные данные замысла." },
        { status: 400 }
      );
    }

    const intent = normalizeIntent(parsed.data);

    // Неизвестные идентификаторы референсов отбрасываем.
    if (intent && Array.isArray(intent.referenceIds)) {
      const known = new Set(
        normalizeReferences(found.project.authorReferences).map((r) => r.id)
      );

      intent.referenceIds = intent.referenceIds.filter((refId) =>
        known.has(refId)
      );
    }

    await prisma.chapter.update({
      where: { id: found.chapter.id },
      data: {
        authorIntent: intent
          ? (intent as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });

    return NextResponse.json({ ok: true, intent });
  } catch (error) {
    console.error("Author intent save error:", error);

    return NextResponse.json(
      { error: "Не удалось сохранить авторский замысел." },
      { status: 500 }
    );
  }
}
