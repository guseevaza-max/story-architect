import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson, validationResponse } from "@/lib/plotMap/access";
import { sendMessageSchema } from "@/lib/coauthor/schema";
import { findOwnThread, requireCoauthorAccess, sendCoauthorMessage } from "@/lib/coauthor/service";

/**
 * Отправка сообщения Соавтору и получение ответа целиком (без потока).
 * Платный вызов идёт через AI Gateway: резерв бюджета, лимит $50, один AiRun.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string; threadId: string }> }) {
  const { id, threadId } = await context.params;
  const access = await requireCoauthorAccess(prisma, id);
  if (access.error) return access.error;
  const thread = await findOwnThread(prisma, { threadId, projectId: access.projectId, userId: access.userId });
  if (!thread) return NextResponse.json({ error: "Беседа не найдена" }, { status: 404 });
  if (thread.archivedAt) {
    return NextResponse.json({ error: "Беседа в архиве. Верните её из архива, чтобы продолжить.", code: "ARCHIVED" }, { status: 409 });
  }

  const parsed = sendMessageSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationResponse(parsed.error);

  const outcome = await sendCoauthorMessage(prisma, {
    userId: access.userId,
    projectId: access.projectId,
    thread,
    input: parsed.data,
  });
  if (!outcome.ok) return NextResponse.json(outcome.body, { status: outcome.status });
  return NextResponse.json({ ok: true, author: outcome.author, reply: outcome.reply, tier: outcome.tier, mock: outcome.mock });
}
