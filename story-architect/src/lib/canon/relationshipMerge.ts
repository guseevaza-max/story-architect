/**
 * Чистая логика слияния отношений персонажей (без обращения к БД).
 *
 * Отношение однозначно определяется ключом:
 *   источник → цель + тип отношения.
 * Направление важно: «Каэль → Марк» и «Марк → Каэль» — разные отношения.
 *
 * Правила при новом RELATIONSHIP_CHANGE в главе N:
 *  1. Если запись этого ключа уже начата в главе N (повторная обработка
 *     или второе изменение в той же главе) — обновляем её, а не создаём
 *     вторую действующую запись.
 *  2. Все более ранние действующие записи ключа закрываются главой N-1.
 *     Закрываются ВСЕ, а не одна: так исправляются прежние дубли.
 *  3. Закрытые записи остаются в базе — история по главам сохраняется.
 *  4. Ничего не удаляется.
 */

export type ActiveRelationship = {
  id: string;
  validFromChapter: number | null;
  validToChapter: number | null;
  createdAt: Date;
};

export type RelationshipMergePlan = {
  /** "update" — обновить запись этой же главы; "create" — создать новую. */
  action: "update" | "create";
  /** Запись, которую нужно обновить (только для action = "update"). */
  updateId: string | null;
  /** Записи, которым нужно поставить validToChapter = N - 1. */
  closeIds: string[];
};

/** Ключ отношения. Направление учитывается. */
export function relationshipKey(
  sourceId: string,
  targetId: string,
  relationType: string
): string {
  return `${sourceId}->${targetId}:${relationType.trim().toLowerCase()}`;
}

export function planRelationshipMerge(
  existing: readonly ActiveRelationship[],
  chapterNumber: number
): RelationshipMergePlan {
  // Действующие на момент главы N: началось не позже N, не закончилось раньше N.
  const active = existing.filter((r) => {
    const startsBeforeOrAt =
      r.validFromChapter === null || r.validFromChapter <= chapterNumber;
    const notEnded =
      r.validToChapter === null || r.validToChapter >= chapterNumber;

    return startsBeforeOrAt && notEnded;
  });

  const sameChapter = active
    .filter((r) => r.validFromChapter === chapterNumber)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const earlier = active.filter((r) => r.validFromChapter !== chapterNumber);

  const newest = sameChapter[0];

  if (newest) {
    return {
      action: "update",
      updateId: newest.id,
      closeIds: earlier.map((r) => r.id),
    };
  }

  return {
    action: "create",
    updateId: null,
    closeIds: earlier.map((r) => r.id),
  };
}
