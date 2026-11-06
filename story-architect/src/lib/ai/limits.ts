/**
 * Лимиты токенов по функциям.
 *
 *  - maxOutputTokens: потолок длины ответа, передаётся провайдеру. У моделей с
 *    рассуждением в него входят и токены рассуждения, поэтому значения с запасом.
 *    Он же задаёт верхнюю границу выходной части резерва бюджета.
 *  - typicalInputTokens: обычный размер запроса, когда вход ограничен самим
 *    маршрутом (take: 100 фактов, MAX_REVISE_CHARS и т. п.).
 *  - maxInputTokens: жёсткий предел для маршрутов с неограниченным входом
 *    (текст главы, текст автора). Больше: запрос отклоняется до платного вызова.
 */
export type AiLimits = {
  typicalInputTokens: number;
  maxInputTokens: number;
  maxOutputTokens: number;
};

export const AI_LIMITS: Record<string, AiLimits> = {
  SCENE_PLANNER: { typicalInputTokens: 16_000, maxInputTokens: 120_000, maxOutputTokens: 16_000 },
  WRITER: { typicalInputTokens: 30_000, maxInputTokens: 150_000, maxOutputTokens: 32_000 },
  REVISE: { typicalInputTokens: 30_000, maxInputTokens: 150_000, maxOutputTokens: 32_000 },
  STORY_ARCHITECT: { typicalInputTokens: 30_000, maxInputTokens: 150_000, maxOutputTokens: 16_000 },
  MEMORY_EXTRACTION: { typicalInputTokens: 30_000, maxInputTokens: 150_000, maxOutputTokens: 16_000 },
  LORE_EXTRACTION: { typicalInputTokens: 20_000, maxInputTokens: 100_000, maxOutputTokens: 12_000 },
  CONTINUITY_CHECK: { typicalInputTokens: 25_000, maxInputTokens: 150_000, maxOutputTokens: 16_000 },
  // Проверка плана и сцен до написания: текста главы нет, вход меньше.
  CONTINUITY_PLAN: { typicalInputTokens: 15_000, maxInputTokens: 100_000, maxOutputTokens: 12_000 },
  CONTINUITY_SUGGESTIONS: { typicalInputTokens: 15_000, maxInputTokens: 100_000, maxOutputTokens: 12_000 },
  CONTINUITY_APPLY: { typicalInputTokens: 25_000, maxInputTokens: 150_000, maxOutputTokens: 32_000 },
  // Соавтор: вход ограничен сборщиком контекста (≈40k знаков) плюс окно беседы.
  COAUTHOR: { typicalInputTokens: 20_000, maxInputTokens: 60_000, maxOutputTokens: 8_000 },
  // Сценарный критик читает главу целиком, отчёт структурированный.
  COAUTHOR_CRITIC: { typicalInputTokens: 30_000, maxInputTokens: 80_000, maxOutputTokens: 10_000 },
  // Сжатие ранней части беседы.
  COAUTHOR_SUMMARY: { typicalInputTokens: 12_000, maxInputTokens: 40_000, maxOutputTokens: 3_000 },
  STORY_BIBLE_ANALYZE: { typicalInputTokens: 8_000, maxInputTokens: 60_000, maxOutputTokens: 12_000 },
};

const FALLBACK: AiLimits = { typicalInputTokens: 25_000, maxInputTokens: 120_000, maxOutputTokens: 16_000 };

export const limitsFor = (role: string): AiLimits => AI_LIMITS[role] ?? FALLBACK;

/**
 * Грубая верхняя оценка токенов: для русского текста около 2–3 символов на токен,
 * берём 2, чтобы не занижать резерв. Это оценка для лимита, не для счёта.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

export class InputTooLargeError extends Error {
  constructor(
    readonly role: string,
    readonly estimatedTokens: number,
    readonly maxTokens: number
  ) {
    super(
      `Запрос слишком большой для функции ${role}: около ${estimatedTokens} токенов при пределе ${maxTokens}. Сократите текст или разбейте его на части.`
    );
    this.name = "InputTooLargeError";
  }
}

/**
 * Проверяет размер входа до платного вызова и возвращает оценку для резерва
 * бюджета по реальному размеру запроса, а не по типичному.
 */
export function inputEstimate(role: string, promptText: string): { inputTokens: number; outputTokens: number } {
  const limits = limitsFor(role);
  const inputTokens = estimateTokens(promptText) + 500; // служебные токены формата
  if (inputTokens > limits.maxInputTokens) {
    throw new InputTooLargeError(role, inputTokens, limits.maxInputTokens);
  }
  return { inputTokens, outputTokens: limits.maxOutputTokens };
}
