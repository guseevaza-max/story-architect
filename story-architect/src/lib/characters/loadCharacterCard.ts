import { prisma } from "@/lib/db";
import { chapterWindow, currentStates, type StateRow } from "@/lib/ux/characterCard";

/**
 * Данные карточки персонажа. Только чтение, только Canon.
 * null — проект не принадлежит пользователю или персонажа нет.
 */
export async function loadCharacterCard(userId: string, projectId: string, characterId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true, name: true } });
  if (!project) return null;

  const character = await prisma.character.findFirst({
    where: { id: characterId, projectId: project.id, status: "CANON" },
    include: {
      states: { where: { status: "CANON" }, include: { chapter: { select: { number: true } } }, orderBy: { createdAt: "asc" } },
      arcs: { include: { stages: { orderBy: { order: "asc" } } }, orderBy: { createdAt: "asc" } },
      relFrom: { where: { status: "CANON" }, include: { target: { select: { id: true, name: true } } } },
      relTo: { where: { status: "CANON" }, include: { source: { select: { id: true, name: true } } } },
      knowledge: { where: { status: "CANON" }, include: { secret: { select: { id: true, name: true, kind: true } } } },
    },
  });
  if (!character) return null;

  const stateRows: StateRow[] = character.states.map((s) => ({
    id: s.id,
    attribute: s.attribute,
    newValue: s.newValue,
    reason: s.reason,
    chapterNumber: s.chapter?.number ?? null,
    createdAt: s.createdAt.toISOString(),
  }));

  const relationships = [
    ...character.relFrom.map((r) => ({ id: r.id, otherId: r.target.id, otherName: r.target.name, outgoing: true, type: r.relationType, value: r.value, reason: r.reason, window: chapterWindow(r.validFromChapter, r.validToChapter) })),
    ...character.relTo.map((r) => ({ id: r.id, otherId: r.source.id, otherName: r.source.name, outgoing: false, type: r.relationType, value: r.value, reason: r.reason, window: chapterWindow(r.validFromChapter, r.validToChapter) })),
  ];

  return { project, character, current: currentStates(stateRows), history: stateRows, relationships };
}
