import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson, validationResponse } from "@/lib/plotMap/access";
import { updateThreadSchema } from "@/lib/coauthor/schema";
import { findOwnThread, requireCoauthorAccess } from "@/lib/coauthor/service";

type Ctx = { params: Promise<{ id: string; threadId: string }> };

/** Беседа с сообщениями (по возрасту, старые первыми). */
export async function GET(_request: Request, context: Ctx) {
  const { id, threadId } = await context.params;
  const access = await requireCoauthorAccess(prisma, id);
  if (access.error) return access.error;
  const thread = await findOwnThread(prisma, { threadId, projectId: access.projectId, userId: access.userId });
  if (!thread) return NextResponse.json({ error: "Беседа не найдена" }, { status: 404 });

  const rows = await prisma.coauthorMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });

  // Цена каждого ответа берётся из записи учёта (AiRun), без повторного расчёта.
  const runIds = rows.map((m) => m.aiRunId).filter((v): v is string => !!v);
  const runs = runIds.length
    ? await prisma.aiRun.findMany({
        where: { id: { in: runIds }, userId: access.userId, projectId: access.projectId },
        select: { id: true, estimatedCost: true, assumedCost: true, costStatus: true },
      })
    : [];
  const byId = new Map(runs.map((r) => [r.id, r]));
  const messages = rows.map((m) => {
    const run = m.aiRunId ? byId.get(m.aiRunId) : undefined;
    return {
      ...m,
      cost: run
        ? {
            usd: run.estimatedCost === null ? null : Number(run.estimatedCost),
            assumedUsd: run.assumedCost === null ? null : Number(run.assumedCost),
            status: run.costStatus,
          }
        : null,
    };
  });
  return NextResponse.json({ thread, messages });
}

/** Переименование, архивирование и возврат из архива, уровень модели по умолчанию. */
export async function PATCH(request: Request, context: Ctx) {
  const { id, threadId } = await context.params;
  const access = await requireCoauthorAccess(prisma, id);
  if (access.error) return access.error;
  const thread = await findOwnThread(prisma, { threadId, projectId: access.projectId, userId: access.userId });
  if (!thread) return NextResponse.json({ error: "Беседа не найдена" }, { status: 404 });

  const parsed = updateThreadSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationResponse(parsed.error);
  const { title, archived, defaultTier } = parsed.data;

  const updated = await prisma.coauthorThread.update({
    where: { id: thread.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(defaultTier !== undefined ? { defaultTier } : {}),
      ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
    },
  });
  return NextResponse.json({ thread: updated });
}

/**
 * Удаляет беседу вместе с сообщениями. Только по явному действию автора:
 * нужен параметр ?confirm=true. Записи расходов (AiRun) остаются.
 */
export async function DELETE(request: Request, context: Ctx) {
  const { id, threadId } = await context.params;
  const access = await requireCoauthorAccess(prisma, id);
  if (access.error) return access.error;
  const thread = await findOwnThread(prisma, { threadId, projectId: access.projectId, userId: access.userId });
  if (!thread) return NextResponse.json({ error: "Беседа не найдена" }, { status: 404 });

  if (new URL(request.url).searchParams.get("confirm") !== "true") {
    return NextResponse.json({ error: "Удаление нужно подтвердить явно (confirm=true)", code: "CONFIRM_REQUIRED" }, { status: 400 });
  }
  await prisma.coauthorThread.delete({ where: { id: thread.id } });
  return NextResponse.json({ ok: true });
}
