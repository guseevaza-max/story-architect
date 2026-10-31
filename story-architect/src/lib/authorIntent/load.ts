import { prisma } from "@/lib/db";
import { buildAuthorDirectionBlock, type DirectionRole } from "./prompt";
import {
  normalizeIntent,
  normalizeReferences,
  resolveReferences,
} from "./schema";

/**
 * Загружает замысел главы и библиотеку референсов проекта и собирает блок
 * для промпта. Пустая строка, если у главы нет замысла и нет референсов,
 * применяемых по умолчанию. Только чтение; ошибки не скрываются, чтобы
 * генерация не шла молча без замысла автора.
 */
export async function loadAuthorDirectionBlock(
  projectId: string,
  chapterId: string,
  role: DirectionRole
): Promise<string> {
  const [chapter, project] = await Promise.all([
    prisma.chapter.findFirst({
      where: { id: chapterId, book: { projectId } },
      select: { authorIntent: true },
    }),
    prisma.project.findFirst({
      where: { id: projectId },
      select: { authorReferences: true },
    }),
  ]);

  const intent = normalizeIntent(chapter?.authorIntent);
  const references = resolveReferences(
    intent,
    normalizeReferences(project?.authorReferences)
  );

  return buildAuthorDirectionBlock({ intent, references, role });
}
