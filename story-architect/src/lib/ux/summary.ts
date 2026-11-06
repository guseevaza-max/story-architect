import type { PrismaClient } from "@prisma/client";
import { loadUsageOverview, parseMonth } from "@/lib/ai/usageReport";
import { chapterStatusCounts, countWords, nextTask, proposalKindLabel, type ChapterBrief, type NextTask } from "./nav";

/**
 * Сводка рабочего стола. Только чтение базы: ни одного запроса к ИИ,
 * ничего не записывается. Ошибка части сводки не ломает страницу.
 */
export type ProjectSummary = {
  chapters: ChapterBrief[];
  statusCounts: { status: string; label: string; count: number }[];
  totalWords: number;
  pending: { total: number; byKind: { label: string; count: number }[] };
  next: NextTask;
  budget: { usedUsd: number; limitUsd: number; warnPercent: number } | null;
  threads: { id: string; title: string; mode: string; updatedAt: Date }[];
};

export async function loadProjectSummary(prisma: PrismaClient, userId: string, projectId: string): Promise<ProjectSummary> {
  const [chapterRows, pendingRows, threads, usage, planPending] = await Promise.all([
    prisma.chapter.findMany({
      where: { book: { projectId } },
      orderBy: [{ book: { number: "asc" } }, { number: "asc" }],
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        planApproved: true,
        authorIdea: true,
        authorIntent: true,
        draftText: true,
        _count: { select: { scenes: true } },
        chapterSummary: { select: { id: true } },
      },
    }),
    prisma.proposal.groupBy({
      by: ["entityType"],
      where: { projectId, status: "PENDING" },
      _count: { _all: true },
    }),
    prisma.coauthorThread.findMany({
      where: { projectId, userId, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { id: true, title: true, mode: true, updatedAt: true },
    }),
    loadUsageOverview(prisma, userId, parseMonth(null)).catch(() => null),
    // ожидающие планы и сцены по главам: чтобы не предлагать повторный платный запуск
    prisma.proposal
      .findMany({
        where: { projectId, status: "PENDING", entityType: { in: ["chapter_plan", "scene_plan"] } },
        select: { sourceChapterId: true },
      })
      .catch(() => [] as { sourceChapterId: string | null }[]),
  ]);
  const pendingByChapter = new Map<string, number>();
  for (const r of planPending) if (r.sourceChapterId) pendingByChapter.set(r.sourceChapterId, (pendingByChapter.get(r.sourceChapterId) ?? 0) + 1);

  let totalWords = 0;
  const chapters: ChapterBrief[] = chapterRows.map((c) => {
    const words = countWords(c.draftText);
    totalWords += words;
    return {
      id: c.id,
      number: c.number,
      title: c.title,
      status: c.status,
      planApproved: c.planApproved,
      sceneCount: c._count.scenes,
      words,
      hasDraft: words > 0,
      hasMemory: !!c.chapterSummary,
      hasIdea: !!c.authorIdea?.trim(),
      hasIntent: c.authorIntent != null,
      pendingPlan: pendingByChapter.get(c.id) ?? 0,
    };
  });

  const byKind = pendingRows.map((r) => ({ label: proposalKindLabel(r.entityType), count: r._count._all })).sort((a, b) => b.count - a.count);
  const total = byKind.reduce((s, r) => s + r.count, 0);

  return {
    chapters,
    statusCounts: chapterStatusCounts(chapters),
    totalWords,
    pending: { total, byKind },
    next: nextTask(projectId, chapters, total),
    budget: usage ? { usedUsd: usage.budgetUsedUsd, limitUsd: usage.limitUsd, warnPercent: usage.warnPercent } : null,
    threads,
  };
}
