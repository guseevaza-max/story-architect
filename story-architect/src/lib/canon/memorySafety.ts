/**
 * Разделение пунктов Memory Update по достоверности.
 *
 * Модель помечает каждый пункт как SAFE, UNCERTAIN или CONFLICT.
 * Принятие всего пакета автором не должно превращать предположения
 * и конфликтные пункты в подтверждённый Canon, поэтому:
 *  - SAFE — идёт в структурированное состояние и в память для генераторов;
 *  - UNCERTAIN и CONFLICT — сохраняются отдельно (для решения автора)
 *    и в память для генераторов не попадают.
 *
 * Ничего не теряется: confirmed + unconfirmed всегда равны исходному списку.
 */

export type MemorySafety = "SAFE" | "UNCERTAIN" | "CONFLICT";

type WithSafety = { safety: MemorySafety };

export function splitBySafety<T extends WithSafety>(
  items: readonly T[]
): { confirmed: T[]; unconfirmed: T[] } {
  const confirmed: T[] = [];
  const unconfirmed: T[] = [];

  for (const item of items) {
    // Только явный SAFE считается подтверждённым.
    if (item.safety === "SAFE") confirmed.push(item);
    else unconfirmed.push(item);
  }

  return { confirmed, unconfirmed };
}

type MemoryLike = {
  updates: readonly WithSafety[];
  characterChanges: readonly WithSafety[];
  relationshipChanges: readonly WithSafety[];
};

export type UnconfirmedMemory<M extends MemoryLike> = {
  updates: M["updates"][number][];
  characterChanges: M["characterChanges"][number][];
  relationshipChanges: M["relationshipChanges"][number][];
};

export function splitMemoryBySafety<M extends MemoryLike>(
  memory: M
): {
  /** Копия памяти только с подтверждёнными (SAFE) пунктами. */
  confirmed: M;
  unconfirmed: UnconfirmedMemory<M>;
  unconfirmedCount: number;
} {
  const updates = splitBySafety<M["updates"][number]>(memory.updates);
  const characters = splitBySafety<M["characterChanges"][number]>(
    memory.characterChanges
  );
  const relationships = splitBySafety<M["relationshipChanges"][number]>(
    memory.relationshipChanges
  );

  const confirmed = {
    ...memory,
    updates: updates.confirmed,
    characterChanges: characters.confirmed,
    relationshipChanges: relationships.confirmed,
  } as unknown as M;

  return {
    confirmed,
    unconfirmed: {
      updates: updates.unconfirmed,
      characterChanges: characters.unconfirmed,
      relationshipChanges: relationships.unconfirmed,
    },
    // characterChanges и relationshipChanges выделены из updates,
    // поэтому считаем непрошедшие пункты по updates.
    unconfirmedCount: updates.unconfirmed.length,
  };
}
