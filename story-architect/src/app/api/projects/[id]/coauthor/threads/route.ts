import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson, validationResponse } from "@/lib/plotMap/access";
import { createThreadSchema } from "@/lib/coauthor/schema";
import { findProjectChapter, requireCoauthorAccess } from "@/lib/coauthor/service";

/** Список бесед проекта текущего пользователя. ?archived=true — архивные. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireCoauthorAccess(prisma, id);
  if (access.error) return access.error;

  const archived = new URL(request.url).searchParams.get("archived") === "true";
  const threads = await prisma.coauthorThread.findMany({
    where: { projectId: access.projectId, userId: access.userId, archivedAt: archived ? { not: null } : null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, scope: true, mode: true, chapterId: true, defaultTier: true, archivedAt: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ threads });
}

/** Создаёт беседу. Модель не вызывается, расходов нет. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await requireCoauthorAccess(prisma, id);
  if (access.error) return access.error;

  const parsed = createThreadSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationResponse(parsed.error);
  const input = parsed.data;

  let chapterTitle: string | null = null;
  if (input.chapterId) {
    const chapter = await findProjectChapter(prisma, access.projectId, input.chapterId);
    if (!chapter) return NextResponse.json({ error: "Глава не найдена" }, { status: 404 });
    chapterTitle = `Глава ${chapter.number}${chapter.title ? ` «${chapter.title}»` : ""}`;
  }

  const thread = await prisma.coauthorThread.create({
    data: {
      projectId: access.projectId,
      userId: access.userId,
      title: input.title ?? (input.mode === "CRITIC" && chapterTitle ? `Критик: ${chapterTitle}` : (chapterTitle ?? "Новая беседа")),
      scope: input.scope,
      chapterId: input.chapterId ?? null,
      defaultTier: input.defaultTier,
      mode: input.mode,
    },
  });
  return NextResponse.json({ thread }, { status: 201 });
}
