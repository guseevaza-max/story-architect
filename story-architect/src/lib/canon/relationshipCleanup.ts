/**
 * Чистая логика очистки дублей отношений (без обращения к БД).
 *
 * Работает с ОДНОЙ группой записей: один источник → одна цель → один тип.
 *
 * Правила:
 *  1. Записи группируются по главе начала (validFromChapter).
 *  2. В каждой главе начала побеждает самая свежая запись,
 *     остальные считаются дублями и отклоняются (REJECTED),
 *     но НЕ удаляются.
 *  3. Окно победителя, перекрывающее следующего победителя,
 *     закрывается главой «начало следующего − 1».
 *     Уже закрытые окна никогда не расширяются.
 *  4. Последний победитель не меняется.
 */

export type CleanupRecord = {
  id: string;
  validFromChapter: number | null;
  validToChapter: number | null;
  createdAt: Date;
};

export type CloseUpdate = {
  id: string;
  validToChapter: number;
  previousValidTo: number | null;
};

export type CleanupPlan = {
  keepIds: string[];
  rejectIds: string[];
  closeUpdates: CloseUpdate[];
};

function newestFirst(a: CleanupRecord, b: CleanupRecord): number {
  const byTime = b.createdAt.getTime() - a.createdAt.getTime();
  if (byTime !== 0) return byTime;
  return b.id.localeCompare(a.id);
}

export function planRelationshipCleanup(
  records: readonly CleanupRecord[]
): CleanupPlan {
  const byStart = new Map<number, CleanupRecord[]>();

  for (const record of records) {
    const key = record.validFromChapter ?? -1;
    const list = byStart.get(key) ?? [];
    list.push(record);
    byStart.set(key, list);
  }

  const starts = [...byStart.keys()].sort((a, b) => a - b);

  const winners: CleanupRecord[] = [];
  const rejectIds: string[] = [];

  for (const start of starts) {
    const sorted = [...(byStart.get(start) ?? [])].sort(newestFirst);
    const winner = sorted[0];

    if (!winner) continue;

    winners.push(winner);
    rejectIds.push(...sorted.slice(1).map((r) => r.id));
  }

  const closeUpdates: CloseUpdate[] = [];

  winners.forEach((winner, index) => {
    const next = winners[index + 1];

    if (!next || next.validFromChapter === null) return;

    const limit = next.validFromChapter - 1;

    if (winner.validToChapter === null || winner.validToChapter > limit) {
      closeUpdates.push({
        id: winner.id,
        validToChapter: limit,
        previousValidTo: winner.validToChapter,
      });
    }
  });

  return {
    keepIds: winners.map((w) => w.id),
    rejectIds,
    closeUpdates,
  };
}
