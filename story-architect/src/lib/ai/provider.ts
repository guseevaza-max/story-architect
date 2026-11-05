
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
  /** Причина остановки ответа (stop, length и т. п.), если провайдер её вернул. */
  finishReason?: string;
  estimatedCost: number;
  durationMs: number;
  /** Сырой блок usage от провайдера (undefined, если провайдер его не вернул). */
  rawUsage?: unknown;
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

export type ProviderName = "openai" | "openrouter" | "custom";

export interface AiConfig {
  provider: ProviderName;
  baseUrl: string;
  apiKey: string;
  keyVar: "OPENAI_API_KEY" | "AI_API_KEY" | "";
}

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

/**
 * Определяет провайдера, адрес и ключ для complete().
 * - openai (по умолчанию): адрес https://api.openai.com/v1, ключ OPENAI_API_KEY
 *   (запасной вариант — AI_API_KEY для старых настроек);
 * - openrouter / custom: ключ AI_API_KEY (запасной — OPENAI_API_KEY).
 * Если AI_PROVIDER не задан, а AI_BASE_URL указывает на openrouter.ai,
 * используется openrouter (обратная совместимость).
 */
export function resolveAiConfig(): AiConfig {
  const explicit = env("AI_PROVIDER").trim().toLowerCase();
  const rawBase = env("AI_BASE_URL").trim().replace(/\/+$/, "");

  let provider: ProviderName = "openai";

  if (explicit === "openrouter" || explicit === "custom" || explicit === "openai") {
    provider = explicit;
  } else if (!explicit && /(^|\/\/|\.)openrouter\.ai(\/|$)/.test(rawBase)) {
    provider = "openrouter";
  } else if (!explicit && rawBase && !/api\.openai\.com/.test(rawBase)) {
    provider = "custom";
  }

  const baseUrl = rawBase || DEFAULT_BASE_URLS[provider] || "";
  const order: ("OPENAI_API_KEY" | "AI_API_KEY")[] =
    provider === "openai"
      ? ["OPENAI_API_KEY", "AI_API_KEY"]
      : ["AI_API_KEY", "OPENAI_API_KEY"];

  for (const keyVar of order) {
    const apiKey = env(keyVar).trim();
    if (apiKey) return { provider, baseUrl, apiKey, keyVar };
  }

  return { provider, baseUrl, apiKey: "", keyVar: "" };
}

function providerHint(config: AiConfig, status: number, detail: string): string {
  if (
    config.provider === "openrouter" &&
    (status === 401 || status === 403) &&
    !config.apiKey.startsWith("sk-or-")
  ) {
    return "Ключ не похож на ключ OpenRouter (они начинаются с sk-or-). Для OpenAI задайте AI_PROVIDER=openai и очистите AI_BASE_URL.";
  }
  if (status === 401 || status === 403) {
    return `Провайдер не принял ключ (${config.keyVar || "ключ"}). Проверьте, что ключ действителен и подходит провайдеру ${config.provider}.`;
  }
  if (status === 404 || (status === 400 && /model/i.test(detail))) {
    return "Возможно, модель из AI_MODEL_* недоступна для вашего ключа. Проверьте её название у провайдера.";
  }
  if (status === 429) {
    return "Превышен лимит запросов или закончился баланс у провайдера.";
  }
  return "";
}

/**
 * Вызов модели через OpenAI-совместимый /chat/completions.
 * По умолчанию — OpenAI (OPENAI_API_KEY); OpenRouter и другие провайдеры
 * по-прежнему поддерживаются через AI_PROVIDER / AI_BASE_URL / AI_API_KEY.
 */
export async function complete(
  req: CompletionRequest
): Promise<CompletionResult> {
  const started = Date.now();
  const cfg = modelConfig(req.modelClass);

  if (env("AI_MOCK") === "true") {
    return mockComplete(req, cfg, started);
  }

  const config = resolveAiConfig();

  if (!config.apiKey) {
    throw new AiProviderError(
      config.provider === "openai"
        ? "OPENAI_API_KEY не настроен. Укажите ключ в .env или включите AI_MOCK=true."
        : "AI_API_KEY не настроен для провайдера " +
          `${config.provider}. Укажите ключ в .env или включите AI_MOCK=true.`
    );
  }

  if (!cfg.model) {
    throw new AiProviderError(
      `Модель для класса ${req.modelClass} не настроена: задайте AI_MODEL_${req.modelClass} в .env.`
    );
  }

  if (!config.baseUrl) {
    throw new AiProviderError(
      "AI_BASE_URL не настроен для выбранного провайдера (AI_PROVIDER=custom требует адрес)."
    );
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: req.messages,
  };

  if (config.provider === "openai") {
    // Новые модели OpenAI принимают max_completion_tokens, а не max_tokens.
    body.max_completion_tokens = req.maxTokens ?? 4000;
    // Не все модели OpenAI допускают нестандартную температуру.
    if (req.temperature !== undefined && env("AI_SEND_TEMPERATURE") === "true") {
      body.temperature = req.temperature;
    }
  } else {
    body.temperature = req.temperature ?? 0.7;
    body.max_tokens = req.maxTokens ?? 4000;

    // Модели с «рассуждением» могут потратить весь лимит ответа на мысли и вернуть
    // пустой текст. AI_REASONING_EFFORT (none | minimal | low | medium | high)
    // ограничивает рассуждение у OpenRouter; без переменной поведение прежнее.
    const effort = env("AI_REASONING_EFFORT").trim().toLowerCase();
    if (effort && /^(none|minimal|low|medium|high)$/.test(effort)) {
      body.reasoning = { effort };
    }
  }

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

  let res: Response;

  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "неизвестная ошибка";
    throw new AiProviderError(
      `Не удалось связаться с провайдером (${config.provider}): ${redact(reason, config.apiKey)}`
    );
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    const hint = providerHint(config, res.status, detail);

    throw new AiProviderError(
      `Провайдер вернул ${res.status}: ${redact(detail, config.apiKey)}${hint ? ` | ${hint}` : ""}`,
      res.status
    );
  }

  let json: {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };

  try {
    json = await res.json();
  } catch {
    throw new AiProviderError("Провайдер вернул ответ, который не удалось разобрать как JSON.");
  }

  const text = json.choices?.[0]?.message?.content ?? "";
  const finishReason = json.choices?.[0]?.finish_reason ?? undefined;
  const inputTokens = json.usage?.prompt_tokens ?? 0;
  const outputTokens = json.usage?.completion_tokens ?? 0;
  const cachedTokens = json.usage?.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    text,
    model: cfg.model,
    inputTokens,
    outputTokens,
    cachedTokens,
    finishReason,
    estimatedCost: estimateCost(req.modelClass, inputTokens, outputTokens),
    durationMs: Date.now() - started,
    rawUsage: json.usage,
  };
}

/** Режим заглушки: реальных вызовов нет, платить нечему. */
export function isMockMode(): boolean {
  return env("AI_MOCK") === "true";
}

/**
 * Провайдер и модель, которые будет использовать complete() для класса модели.
 * Нужны до вызова: по ним выбирается тариф и считается резерв бюджета.
 */
export function describeCompletionTarget(cls: ModelClass): { provider: string; model: string } {
  return { provider: resolveAiConfig().provider, model: modelConfig(cls).model || `class:${cls}` };
}

/** Убирает возможные ключи из строк перед логированием. */
export function redact(value: string, knownKey?: string): string {
  let out = value;
  if (knownKey && knownKey.length >= 8) out = out.split(knownKey).join("***");
  return out.replace(/(sk-(?:or-)?|key-)[A-Za-z0-9_-]{8,}/g, "$1***");
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
