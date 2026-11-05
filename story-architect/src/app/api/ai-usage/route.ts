import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { loadUsageOverview, parseMonth } from "@/lib/ai/usageReport";

/** Расходы на ИИ за месяц: по функциям, моделям, дням и проектам. Только чтение. */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const month = parseMonth(new URL(request.url).searchParams.get("month"));
    const overview = await loadUsageOverview(prisma, session.user.id, month);
    return NextResponse.json({ ok: true, ...overview });
  } catch (error) {
    console.error("AI usage load error:", error);
    return NextResponse.json({ error: "Не удалось загрузить расходы ИИ" }, { status: 500 });
  }
}
