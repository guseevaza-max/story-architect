import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  formatStoryState,
  type StateCharacter,
  type StateRelationship,
  type StateRow,
} from "./storyStateFormat";

/**
 * Опорная глава, относительно которой собирается контекст.
 * Состояние строится «на начало главы»: учитываются только главы,
 * которые идут СТРОГО ДО неё.
 */
export type StoryStateRef = {
  projectId: string;
  bookId: string;
  bookNumber: number;
  chapterNumber: number;
};

/** Условие для глав, идущих строго до текущей. */
export function chaptersBefore(ref: StoryStateRef): Prisma.ChapterWhereInput {
  return {
    book: { projectId: ref.projectId },
    OR: [
      { bookId: ref.bookId, number: { lt: ref.chapterNumber } },
      { book: { number: { lt: ref.bookNumber } } },
    ],
  };
}

/**
 * Условие для MemoryChunk: общая память проекта (без главы) плюс память
 * ТОЛЬКО предыдущих глав. Память более поздних глав не попадает в контекст.
 */
export function memoryChunksBefore(
  ref: StoryStateRef
): Prisma.MemoryChunkWhereInput {
  return {
    projectId: ref.projectId,
    OR: [{ chapterId: null }, { chapter: { is: chaptersBefore(ref) } }],
  };
}

/** Сколько данных попало в контекст — для отладки и интерфейса. */
export type StoryStateResult = {
  text: string;
  characters: number;
  states: number;
  relationships: number;
};

/**
 * Накопленное состояние истории на начало главы:
 * подтверждённые (CANON) персонажи, их последние состояния
 * и действующие отношения. Только чтение, ничего не пишет.
 */
export async function buildStoryState(
  ref: StoryStateRef,
  options: { maxChars?: number } = {}
): Promise<string> {
  const result = await buildStoryStateWithStats(ref, options);
  return result.text;
}

/** То же, что buildStoryState, но с количеством найденных записей. */
export async function buildStoryStateWithStats(
  ref: StoryStateRef,
  options: { maxChars?: number } = {}
): Promise<StoryStateResult> {
  const before = chaptersBefore(ref);

  const [characters, states, relationships] = await Promise.all([
    prisma.character.findMany({
      where: { projectId: ref.projectId, status: "CANON" },
      select: {
        id: true,
        name: true,
        role: true,
        tier: true,
        description: true,
      },
      orderBy: [{ tier: "asc" }, { name: "asc" }],
      take: 60,
    }),

    prisma.characterState.findMany({
      where: {
        status: "CANON",
        character: { projectId: ref.projectId, status: "CANON" },
        OR: [{ chapterId: null }, { chapter: { is: before } }],
      },
      select: {
        characterId: true,
        attribute: true,
        newValue: true,
        createdAt: true,
        chapter: {
          select: { number: true, book: { select: { number: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 1000,
    }),

    prisma.relationship.findMany({
      where: {
        projectId: ref.projectId,
        status: "CANON",
        AND: [
          {
            OR: [
              { validFromChapter: null },
              { validFromChapter: { lt: ref.chapterNumber } },
            ],
          },
          {
            OR: [
              { validToChapter: null },
              { validToChapter: { gte: ref.chapterNumber - 1 } },
            ],
          },
        ],
      },
      select: {
        relationType: true,
        reason: true,
        source: { select: { name: true } },
        target: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  const stateCharacters: StateCharacter[] = characters;

  const stateRows: StateRow[] = states.map((s) => ({
    characterId: s.characterId,
    attribute: s.attribute,
    value: s.newValue,
    // книга → глава → время создания: новее значит позже
    order:
      (s.chapter?.book.number ?? 0) * 1_000_000 +
      (s.chapter?.number ?? 0) * 1_000 +
      s.createdAt.getTime() / 1e13,
  }));

  // На одну пару и тип отношений оставляем самую свежую запись.
  const seen = new Set<string>();
  const stateRelationships: StateRelationship[] = [];

  for (const r of relationships) {
    const key = `${r.source.name}→${r.target.name}:${r.relationType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    stateRelationships.push({
      source: r.source.name,
      target: r.target.name,
      type: r.relationType,
      reason: r.reason,
    });
  }

  return {
    text: formatStoryState(
      stateCharacters,
      stateRows,
      stateRelationships,
      options.maxChars
    ),
    characters: stateCharacters.length,
    states: stateRows.length,
    relationships: stateRelationships.length,
  };
}
