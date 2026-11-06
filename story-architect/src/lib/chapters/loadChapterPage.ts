import { prisma } from "@/lib/db";
import { summaryText, type PlanHistoryItem } from "@/lib/ux/planHistory";

export type ChapterPlan = {
  chapterPurpose?: string;
  initialState?: string;
  endState?: string;
  plotDevelopment?: string[];
  characterDevelopment?: string[];
  mustHappen?: string[];
  mustNotHappen?: string[];
  openQuestions?: string[];
  authorAnswers?: { question: string; answer: string }[];
};

export const CHAPTER_STATUS_LABELS: Record<string, string> = {
  IDEA: "Идея",
  PLANNED: "Запланирована",
  DRAFT: "Черновик",
  EDITING: "Редактирование",
  CHECKING: "Проверка",
  APPROVED: "Утверждена",
  CANON: "Canon",
};

export function planHasContent(plan: ChapterPlan | null): boolean {
  return !!(
    plan &&
    (plan.chapterPurpose ||
      plan.initialState ||
      plan.endState ||
      plan.plotDevelopment?.length ||
      plan.characterDevelopment?.length ||
      plan.mustHappen?.length ||
      plan.mustNotHappen?.length ||
      plan.openQuestions?.length)
  );
}

/**
 * Данные для страницы главы. Только чтение. Возвращает null, если проект
 * не принадлежит пользователю или главы в нём нет (страница покажет 404).
 */
export async function loadChapterPage(userId: string, projectId: string, chapterId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true, name: true } });
  if (!project) return null;

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, book: { projectId: project.id } },
    include: { book: true, scenes: { orderBy: { order: "asc" } } },
  });
  if (!chapter) return null;

  const pending = await prisma.proposal.findMany({
    where: { projectId: project.id, status: "PENDING", sourceChapterId: chapter.id, entityType: { in: ["chapter_plan", "scene_plan"] } },
    orderBy: { createdAt: "desc" },
  });
  // История решений по планам этой главы (только чтение).
  const decided = await prisma.proposal.findMany({
    where: { projectId: project.id, status: { in: ["ACCEPTED", "REJECTED", "SUPERSEDED"] }, sourceChapterId: chapter.id, entityType: { in: ["chapter_plan", "scene_plan"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const history = decided.map((d) => ({
    id: d.id,
    entityType: d.entityType,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
  }));

  // История проверок плана (level 0). Только чтение; сбой не мешает странице.
  let planChecks: PlanHistoryItem[] = [];
  try {
    const reports = await prisma.continuityReport.findMany({
      where: { chapterId: chapter.id, level: 0 },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { issues: { select: { title: true, priority: true, category: true } } },
    });
    planChecks = reports.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), summary: summaryText(r.summary), issues: r.issues }));
  } catch {
    planChecks = [];
  }

  const siblingRows = await prisma.chapter.findMany({
    where: { book: { projectId: project.id } },
    select: { id: true, number: true, title: true, status: true, book: { select: { number: true } } },
  });
  const siblings = siblingRows.map((c) => ({ id: c.id, number: c.number, title: c.title, status: c.status, bookNumber: c.book.number }));

  const plan = chapter.plan as ChapterPlan | null;
  return { project, chapter, plan, hasPlan: planHasContent(plan), pending, history, planChecks, siblings };
}
