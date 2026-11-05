import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { loadNarrativeContext } from "@/lib/plotMap/loadNarrative";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

/**
 * Предпросмотр долгосрочного контекста, который получит Writer.
 * Использует тот же loadNarrativeContext, что и сам Writer. Только чтение;
 * содержит спойлеры и предназначен для автора.
 */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id, chapterId } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });

    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, book: { projectId: project.id } },
      select: { id: true, number: true, bookId: true },
    });
    if (!chapter) return NextResponse.json({ error: "Глава не найдена" }, { status: 404 });

    const [narrative, canonFactCount] = await Promise.all([
      loadNarrativeContext({ bookId: chapter.bookId, number: chapter.number, projectId: project.id }),
      // Те же условия, что у Writer: факты Canon, действующие на эту главу.
      prisma.canonFact.count({
        where: {
          projectId: project.id,
          status: "CANON",
          OR: [{ validFromChapter: null }, { validFromChapter: { lte: chapter.number } }],
          AND: [{ OR: [{ validToChapter: null }, { validToChapter: { gte: chapter.number } }] }],
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      isEmpty: narrative.isEmpty,
      preview: narrative.preview,
      promptBlock: narrative.promptBlock,
      canonFactCount,
    });
  } catch (error) {
    console.error("Narrative context preview error:", error);
    return NextResponse.json({ error: "Не удалось собрать контекст" }, { status: 500 });
  }
}
