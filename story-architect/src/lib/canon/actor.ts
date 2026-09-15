/**
 * Тип-барьер шлюза канона (ТЗ п. 58: AI не имеет прямого доступа на запись).
 *
 * `AuthorActor` помечен уникальным символом, который не экспортируется.
 * Создать значение этого типа можно ТОLЬКО через `authorActorFromSession()`
 * в этом файле. Код под `src/lib/ai/**` физически не может собрать такой
 * объект — а без него `applyProposal()` не вызвать.
 */

declare const AUTHOR_BRAND: unique symbol;

export interface AuthorActor {
  readonly [AUTHOR_BRAND]: true;
  readonly type: "AUTHOR";
  readonly userId: string;
}

export interface SessionLike {
  user?: { id?: string | null } | null;
}

/**
 * Единственный конструктор AuthorActor. Принимает проверенную сессию
 * пользователя. Вызывается из серверных экшенов, не из AI-слоя.
 */
export function authorActorFromSession(session: SessionLike | null): AuthorActor {
  const userId = session?.user?.id;
  if (!userId) {
    throw new CanonAccessError(
      "Изменение канона требует аутентифицированного автора"
    );
  }
  return { type: "AUTHOR", userId } as AuthorActor;
}

export class CanonAccessError extends Error {
  readonly code = "CANON_ACCESS_DENIED";
}

export class ProposalStateError extends Error {
  readonly code = "PROPOSAL_INVALID_STATE";
}
