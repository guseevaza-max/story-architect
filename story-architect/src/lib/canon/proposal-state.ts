/**
 * Машина состояний предложения (ТЗ п. 13, 14, 75).
 *
 * Вынесена в чистую функцию намеренно: правила перехода — самая
 * ответственная часть системы, и они должны проверяться тестами
 * без базы данных и без AI.
 */

export type ProposalStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";
export type ProposalAction = "ACCEPT" | "REJECT" | "EDIT_AND_ACCEPT" | "SUPERSEDE";
export type ActorType = "AUTHOR" | "AI" | "SYSTEM";

export interface TransitionInput {
  current: ProposalStatus;
  action: ProposalAction;
  actorType: ActorType;
}

export interface TransitionResult {
  next: ProposalStatus;
  /** Применять изменение к канону только при true. */
  mutatesCanon: boolean;
}

/**
 * Ключевые инварианты:
 *  1. Канон меняет только автор. AI и система не могут принять предложение.
 *  2. Из терминального состояния перехода нет — решение автора не
 *     перезаписывается повторным прогоном AI (ТЗ п. 8).
 *  3. Отклонённое предложение никогда не становится каноном.
 */
export function transitionProposal(input: TransitionInput): TransitionResult {
  const { current, action, actorType } = input;

  if (current !== "PENDING") {
    throw new Error(
      `Предложение уже в состоянии ${current}, переход невозможен`
    );
  }

  if (action === "SUPERSEDE") {
    // Системное вытеснение устаревшего предложения новым.
    return { next: "SUPERSEDED", mutatesCanon: false };
  }

  if (actorType !== "AUTHOR") {
    throw new Error(
      `Действие ${action} доступно только автору, получено: ${actorType}`
    );
  }

  switch (action) {
    case "ACCEPT":
    case "EDIT_AND_ACCEPT":
      return { next: "ACCEPTED", mutatesCanon: true };
    case "REJECT":
      return { next: "REJECTED", mutatesCanon: false };
  }
}

/**
 * Участвует ли запись в контексте для AI.
 * ТЗ п. 8: отклонённое предложение не используется как активный канон.
 */
export function isUsableAsCanon(recordStatus: string): boolean {
  return recordStatus === "CANON";
}

/** Попадает ли запись в Context Pack (канон + осознанно неизвестное). */
export function isContextEligible(recordStatus: string): boolean {
  return recordStatus === "CANON" || recordStatus === "UNKNOWN";
}
