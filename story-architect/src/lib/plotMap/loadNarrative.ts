import { prisma } from "@/lib/db";
import { buildNarrativeContext, type NarrativeContext } from "./narrativeContext";

/**
 * Загружает сюжетную карту книги главы и собирает Narrative Context.
 * Только чтение. Ошибки базы не скрываются: генерация не должна идти молча
 * без защиты тайн. Пустая карта ошибкой не является.
 */
export async function loadNarrativeContext(chapter: {
  bookId: string;
  number: number;
  projectId: string;
}): Promise<NarrativeContext> {
  const [book, beats, secrets] = await Promise.all([
    prisma.book.findFirst({
      where: { id: chapter.bookId, projectId: chapter.projectId },
      select: {
        id: true,
        title: true,
        number: true,
        premise: true,
        mainArc: true,
        plannedEnding: true,
        themes: true,
        centralConflicts: true,
        authorConstraints: true,
      },
    }),
    prisma.plotBeat.findMany({
      where: { projectId: chapter.projectId, bookId: chapter.bookId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        bookId: true,
        order: true,
        name: true,
        description: true,
        narrativeFunction: true,
        causes: true,
        consequences: true,
        plannedChapterFrom: true,
        plannedChapterTo: true,
        approval: true,
        disclosure: true,
      },
    }),
    prisma.secret.findMany({
      where: { projectId: chapter.projectId, status: "CANON" },
      orderBy: [{ importance: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        importance: true,
        status: true,
        revealStatus: true,
        objectiveTruth: true,
        hintFromChapter: true,
        partialRevealChapter: true,
        plannedRevealChapter: true,
        forbiddenEarly: true,
      },
    }),
  ]);

  return buildNarrativeContext({ chapterNumber: chapter.number, book, beats, secrets });
}
