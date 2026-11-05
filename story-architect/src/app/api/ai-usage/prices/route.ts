import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const price = z.number().min(0, "Цена не может быть отрицательной.").max(10000);
const schema = z.object({
  provider: z.string().trim().min(1, "Укажи провайдера.").max(50),
  model: z.string().trim().min(1, "Укажи модель.").max(120),
  inputPer1M: price,
  outputPer1M: price,
  cachedInputPer1M: price.nullish(),
  source: z.string().trim().max(300).nullish(),
});

/**
 * Добавляет новый тариф модели (USD за 1 млн токенов). Прошлые записи не
 * меняются: новая цена действует на вызовы после этого момента.
 */
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
    }

    const d = parsed.data;
    await prisma.aiModelPrice.create({
      data: {
        provider: d.provider,
        model: d.model,
        inputPer1M: d.inputPer1M,
        outputPer1M: d.outputPer1M,
        cachedInputPer1M: d.cachedInputPer1M ?? null,
        source: d.source || "Указано автором",
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("AI price update error:", error);
    return NextResponse.json({ error: "Не удалось сохранить тариф" }, { status: 500 });
  }
}
