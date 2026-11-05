import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { ZodError } from "zod";

/** Проект текущего пользователя или готовый ответ с ошибкой. */
export async function requireOwnedProject(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    select: { id: true },
  });
  if (!project) {
    return { error: NextResponse.json({ error: "Проект не найден" }, { status: 404 }) };
  }

  return { project };
}

export function validationResponse(error: ZodError) {
  return NextResponse.json(
    { error: error.issues[0]?.message ?? "Некорректные данные" },
    { status: 400 }
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
