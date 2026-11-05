/**
 * Ответы автора на открытые вопросы плана главы.
 *
 * Хранятся внутри плана главы (chapter.plan.authorAnswers), поэтому попадают
 * в контекст Scene Planner и Writer вместе с планом. Писать их может только
 * автор: ответы принимаются лишь в EDIT_AND_ACCEPT (см. applyProposal).
 */
export const MAX_AUTHOR_ANSWERS = 30;
export const MAX_ANSWER_CHARS = 4000;

export type AuthorAnswer = { question: string; answer: string };

export class AuthorAnswersError extends Error {}

export function normalizeAuthorAnswers(
  value: unknown,
  openQuestions: string[]
): AuthorAnswer[] | undefined {
  if (value === undefined || value === null) return undefined;

  if (!Array.isArray(value)) {
    throw new AuthorAnswersError("Ответы автора должны быть списком");
  }
  if (value.length > MAX_AUTHOR_ANSWERS) {
    throw new AuthorAnswersError("Слишком много ответов автора");
  }

  const known = new Set(openQuestions.map((q) => q.trim()));
  const byQuestion = new Map<string, string>();

  for (const item of value) {
    const record = item as { question?: unknown; answer?: unknown } | null;
    if (
      !record ||
      typeof record.question !== "string" ||
      typeof record.answer !== "string"
    ) {
      throw new AuthorAnswersError(
        "Каждый ответ автора должен содержать вопрос и текст ответа"
      );
    }

    const question = record.question.trim();
    const answer = record.answer.trim();
    if (!answer) continue; // пустой ответ — вопрос остаётся открытым

    if (!known.has(question)) {
      throw new AuthorAnswersError(
        "Ответ относится к вопросу, которого нет в плане главы"
      );
    }
    if (answer.length > MAX_ANSWER_CHARS) {
      throw new AuthorAnswersError(
        `Ответ слишком длинный (максимум ${MAX_ANSWER_CHARS} символов)`
      );
    }

    byQuestion.set(question, answer);
  }

  if (byQuestion.size === 0) return undefined;

  // Порядок как у вопросов в плане.
  return openQuestions
    .map((q) => q.trim())
    .filter((q) => byQuestion.has(q))
    .map((question) => ({ question, answer: byQuestion.get(question) as string }));
}
