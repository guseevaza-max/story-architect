import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { secretCreateSchema } from "@/lib/plotMap/schema";
import { readJson, requireOwnedProject, validationResponse } from "@/lib/plotMap/access";

type Ctx = { params: Promise<{ id: string }> };

/** Тайна с планом раскрытия. Создаёт автор, поэтому статус сразу CANON. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const owned = await requireOwnedProject(id);
    if (owned.error) return owned.error;

    const parsed = secretCreateSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationResponse(parsed.error);

    const secret = await prisma.secret.create({
      data: { projectId: id, kind: "SECRET", status: "CANON", ...parsed.data },
    });

    return NextResponse.json({ ok: true, secret }, { status: 201 });
  } catch (error) {
    console.error("Secret create error:", error);
    return NextResponse.json({ error: "Не удалось создать тайну" }, { status: 500 });
  }
}
