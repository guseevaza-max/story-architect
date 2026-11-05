import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson, validationResponse } from "@/lib/plotMap/access";
import { sendMessageSchema } from "@/lib/coauthor/schema";
import { findOwnThread, requireCoauthorAccess, streamCoauthorMessage } from "@/lib/coauthor/service";

/**
 * Потоковый ответ Соавтора (NDJSON: delta / done / error).
 * Ошибки до начала потока (лимит 429, слишком большой запрос и т. п.) приходят
 * обычным JSON с правильным кодом. Отмена клиентом прерывает запрос к модели.
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

  const started = await streamCoauthorMessage(
    prisma,
    { userId: access.userId, projectId: access.projectId, thread, input: parsed.data },
    request.signal
  );
  if (!started.ok) return NextResponse.json(started.body, { status: started.status });

  return new Response(started.stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
