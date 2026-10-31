
import "server-only";
import OpenAI from "openai";

/**
 * AI Provider Layer:
 * AI Router → Provider → Model.
 *
 * Ключи читаются только на сервере и только в этом модуле.
 * complete() сохраняет существующий путь через AI_BASE_URL (например, OpenRouter).
 * getOpenAIClient() предоставляет SDK-клиент для существующих API-маршрутов.
 */

export type ModelClass = "FAST" | "STRONG" | "REASONING";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  modelClass: ModelClass;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** JSON Schema для structured output. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}

export interface CompletionResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCost: number;
  durationMs: number;
}

interface ModelConfig {
  model: string;
  priceIn: number;
  priceOut: number;
}

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function modelConfig(cls: ModelClass): ModelConfig {
  const map: Record<ModelClass, ModelConfig> = {
    FAST: {
      model: env("AI_MODEL_FAST"),
      priceIn: Number(env("AI_PRICE_FAST_IN", "0")),
      priceOut: Number(env("AI_PRICE_FAST_OUT", "0")),
    },
    STRONG: {
      model: env("AI_MODEL_STRONG"),
      priceIn: Number(env("AI_PRICE_STRONG_IN", "0")),
      priceOut: Number(env("AI_PRICE_STRONG_OUT", "0")),
    },
    REASONING: {
      model: env("AI_MODEL_REASONING"),
      priceIn: Number(env("AI_PRICE_REASONING_IN", "0")),
      priceOut: Number(env("AI_PRICE_REASONING_OUT", "0")),
    },
  };

  return map[cls];
}

export function estimateCost(
  cls: ModelClass,
  inputTokens: number,
  outputTokens: number
): number {
  const cfg = modelConfig(cls);

  return (
    (inputTokens / 1_000_000) * cfg.priceIn +
    (outputTokens / 1_000_000) * cfg.priceOut
  );
}

export class AiProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AiProviderError";
  }
}

/**
 * Создаёт SDK-клиент для маршрутов, использующих OpenAI API.
 * Значение ключа не возвращается и не записывается в логи.
 */
export function getOpenAIClient(): OpenAI {
  const apiKey = env("OPENAI_API_KEY");

  if (!apiKey) {
    throw new AiProviderError("OPENAI_API_KEY не настроен");
  }

  return new OpenAI({ apiKey });
}

/** Проверяет наличие ключа, не раскрывая его значение. */
export function hasOpenAIKey(): boolean {
  return Boolean(env("OPENAI_API_KEY"));
}

/**
 * Вызов модели через настроенный AI_BASE_URL.
 * Существующий путь через AI_API_KEY и OpenRouter сохранён.
 */
export async function complete(
  req: CompletionRequest
): Promise<CompletionResult> {
  const started = Date.now();
  const cfg = modelConfig(req.modelClass);

  if (env("AI_MOCK") === "true") {
    return mockComplete(req, cfg, started);
  }

  const apiKey = env("AI_API_KEY");

  if (!apiKey) {
    throw new AiProviderError(
      "AI_API_KEY не задан. Укажите ключ в .env или включите AI_MOCK=true."
    );
  }

  if (!cfg.model) {
    throw new AiProviderError(
      `Модель для класса ${req.modelClass} не настроена (AI_MODEL_*)`
    );
  }

  const baseUrl = env("AI_BASE_URL").replace(/\/+$/, "");

  if (!baseUrl) {
    throw new AiProviderError("AI_BASE_URL не настроен");
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 4000,
  };

  if (req.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: req.jsonSchema.name,
        schema: req.jsonSchema.schema,
        strict: true,
      },
    };
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);

    throw new AiProviderError(
      `Провайдер вернул ${res.status}: ${redact(detail)}`,
      res.status
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };

  const text = json.choices?.[0]?.message?.content ?? "";
  const inputTokens = json.usage?.prompt_tokens ?? 0;
  const outputTokens = json.usage?.completion_tokens ?? 0;
  const cachedTokens = json.usage?.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    text,
    model: cfg.model,
    inputTokens,
    outputTokens,
    cachedTokens,
    estimatedCost: estimateCost(
      req.modelClass,
      inputTokens,
      outputTokens
    ),
    durationMs: Date.now() - started,
  };
}

/** Убирает возможные ключи из строк перед логированием. */
export function redact(value: string): string {
  return value.replace(/(sk-|key-)[A-Za-z0-9_-]{8,}/g, "$1***");
}

function mockComplete(
  req: CompletionRequest,
  cfg: ModelConfig,
  started: number
): CompletionResult {
  const text = req.jsonSchema
    ? JSON.stringify({ __mock: true, schema: req.jsonSchema.name })
    : "[MOCK] Ответ заглушки. Установите AI_API_KEY для реальной генерации.";

  return {
    text,
    model: cfg.model || `mock-${req.modelClass.toLowerCase()}`,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    estimatedCost: 0,
    durationMs: Date.now() - started,
  };
}
