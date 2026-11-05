/**
 * Уровни модели Соавтора. Luna по умолчанию, Terra только по явному выбору автора.
 * Sol не используется и в схему запроса не допускается.
 * Тарифы лежат в таблице AiModelPrice (миграция 0006), здесь только идентификаторы.
 */
export type CoauthorTierName = "LUNA" | "TERRA";

export const COAUTHOR_ROLE_KEY = "COAUTHOR";
export const COAUTHOR_CRITIC_ROLE_KEY = "COAUTHOR_CRITIC";
export const COAUTHOR_SUMMARY_ROLE_KEY = "COAUTHOR_SUMMARY";

export const COAUTHOR_TIERS: Record<CoauthorTierName, { provider: string; model: string }> = {
  LUNA: { provider: "openai", model: "gpt-5.6-luna" },
  TERRA: { provider: "openai", model: "gpt-5.6-terra" },
};

export const DEFAULT_TIER: CoauthorTierName = "LUNA";

/** Потолки размеров. Вместе они ограничивают вход до оценки максимум ~34k токенов. */
export const COAUTHOR_LIMITS = {
  messageChars: 8_000,
  fragmentChars: 8_000,
  historyMessages: 12,
  historyChars: 12_000,
  contextChars: 40_000,
  titleChars: 120,
  /** Сколько знаков главы читает критик (обычное обсуждение видит только начало). */
  criticDraftChars: 40_000,
  criticContextChars: 70_000,
  /** Сжатие: сколько последних сообщений остаётся «как есть» и сколько знаков берётся в один пересказ. */
  summaryKeepLast: 6,
  summaryMinMessages: 10,
  summaryInputChars: 24_000,
  summaryChars: 6_000,
} as const;
