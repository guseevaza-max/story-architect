import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_WARN_PERCENT } from "@/lib/ai/usage";

const schema = z.object({
  monthlyLimitUsd: z.number().positive("Лимит должен быть больше нуля.").max(100000),
  warnPercent: z.number().int().min(1).max(100).optional(),
});

/** Меняет месячный лимит расходов. Действует на новые вызовы сразу. */
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
    }

    const { monthlyLimitUsd, warnPercent } = parsed.data;
    await prisma.aiBudget.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, monthlyLimitUsd, warnPercent: warnPercent ?? DEFAULT_WARN_PERCENT },
      update: { monthlyLimitUsd, ...(warnPercent !== undefined ? { warnPercent } : {}) },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("AI budget update error:", error);
    return NextResponse.json({ error: "Не удалось сохранить лимит" }, { status: 500 });
  }
}
