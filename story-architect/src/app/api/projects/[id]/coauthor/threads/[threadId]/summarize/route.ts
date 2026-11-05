import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findOwnThread, requireCoauthorAccess, summarizeThread } from "@/lib/coauthor/service";

/**
 * Сжимает раннюю часть длинной беседы в краткий пересказ. Только по явной
 * команде автора: это платный вызов на экономной модели (Luna) с учётом бюджета.
 * Сообщения не удаляются; пересказ не Canon.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string; threadId: string }> }) {
  const { id, threadId } = await context.params;
  const access = await requireCoauthorAccess(prisma, id);
  if (access.error) return access.error;
  const thread = await findOwnThread(prisma, { threadId, projectId: access.projectId, userId: access.userId });
  if (!thread) return NextResponse.json({ error: "Беседа не найдена" }, { status: 404 });
  if (thread.archivedAt) {
    return NextResponse.json({ error: "Беседа в архиве. Верните её из архива.", code: "ARCHIVED" }, { status: 409 });
  }

  const outcome = await summarizeThread(prisma, { userId: access.userId, projectId: access.projectId, thread });
  if (!outcome.ok) return NextResponse.json(outcome.body, { status: outcome.status });
  return NextResponse.json({ ok: true, thread: outcome.thread, folded: outcome.folded, mock: outcome.mock });
}
