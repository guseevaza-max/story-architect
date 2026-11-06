import { prisma } from "@/lib/db";

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
    select: { id: true, entityType: true },
  });

  const siblingRows = await prisma.chapter.findMany({
    where: { book: { projectId: project.id } },
    select: { id: true, number: true, title: true, status: true, book: { select: { number: true } } },
  });
  const siblings = siblingRows.map((c) => ({ id: c.id, number: c.number, title: c.title, status: c.status, bookNumber: c.book.number }));

  const plan = chapter.plan as ChapterPlan | null;
  return { project, chapter, plan, hasPlan: planHasContent(plan), pending, siblings };
}
