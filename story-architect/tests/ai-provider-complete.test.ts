import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AiProviderError,
  complete,
  redact,
  resolveAiConfig,
} from "../src/lib/ai/provider";

const names = [
  "OPENAI_API_KEY",
  "AI_API_KEY",
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_MODEL_STRONG",
  "AI_MODEL_FAST",
  "AI_MOCK",
  "AI_SEND_TEMPERATURE",
  "AI_REASONING_EFFORT",
  "AI_PRICE_STRONG_IN",
  "AI_PRICE_STRONG_OUT",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of names) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  vi.unstubAllGlobals();
});

const request = {
  modelClass: "STRONG" as const,
  temperature: 0.1,
  maxTokens: 500,
  messages: [{ role: "user" as const, content: "привет" }],
};

function okFetch() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: "{}" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
    text: async () => "",
  }));
}

type Call = [string, RequestInit];

describe("resolveAiConfig", () => {
  it("по умолчанию — OpenAI с адресом по умолчанию и ключом OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "sk-openai-aaaaaaaa";
    const config = resolveAiConfig();
    expect(config.provider).toBe("openai");
    expect(config.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.keyVar).toBe("OPENAI_API_KEY");
  });

  it("OpenRouter определяется по AI_BASE_URL без AI_PROVIDER и берёт AI_API_KEY", () => {
    process.env.AI_BASE_URL = "https://openrouter.ai/api/v1/";
    process.env.AI_API_KEY = "sk-or-aaaaaaaa";
    process.env.OPENAI_API_KEY = "sk-openai-aaaaaaaa";
    const config = resolveAiConfig();
    expect(config.provider).toBe("openrouter");
    expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(config.keyVar).toBe("AI_API_KEY");
  });

  it("старая настройка openai с ключом только в AI_API_KEY продолжает работать", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-old-aaaaaaaa";
    expect(resolveAiConfig().keyVar).toBe("AI_API_KEY");
  });

  it("явный AI_PROVIDER=openai важнее оставшегося AI_BASE_URL openrouter", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_BASE_URL = "";
    process.env.OPENAI_API_KEY = "sk-openai-aaaaaaaa";
    expect(resolveAiConfig().baseUrl).toBe("https://api.openai.com/v1");
  });
});

describe("complete(): проверка настроек до обращения к сети", () => {
  it("без ключа — понятная ошибка с именем OPENAI_API_KEY, сеть не используется", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_MODEL_STRONG = "model-x";

    await expect(complete(request)).rejects.toThrow("OPENAI_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("без AI_MODEL_STRONG — ошибка с именем переменной, сеть не используется", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.OPENAI_API_KEY = "sk-test-key-aaaaaaaa";

    await expect(complete(request)).rejects.toThrow("AI_MODEL_STRONG");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("custom без AI_BASE_URL — ошибка, а не относительный адрес", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_PROVIDER = "custom";
    process.env.AI_API_KEY = "key-aaaaaaaa";
    process.env.AI_MODEL_STRONG = "model-x";

    await expect(complete(request)).rejects.toThrow("AI_BASE_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AI_MOCK=true работает без ключа", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_MOCK = "true";

    const result = await complete(request);
    expect(result.text).toContain("MOCK");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("complete(): запрос к провайдеру", () => {
  it("OpenAI: адрес по умолчанию, ключ из OPENAI_API_KEY, max_completion_tokens, без temperature", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    process.env.OPENAI_API_KEY = "sk-test-key-aaaaaaaa";
    process.env.AI_MODEL_STRONG = "model-x";

    const result = await complete(request);

    expect(result.text).toBe("{}");
    const [url, init] = fetchMock.mock.calls[0] as unknown as Call;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test-key-aaaaaaaa"
    );
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("model-x");
    expect(body.max_completion_tokens).toBe(500);
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
  });

  it("OpenRouter: прежний путь через AI_API_KEY, max_tokens и temperature сохранены", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_PROVIDER = "openrouter";
    process.env.AI_BASE_URL = "https://openrouter.ai/api/v1";
    process.env.AI_API_KEY = "sk-or-test-aaaaaaaa";
    process.env.AI_MODEL_STRONG = "vendor/model";

    await complete(request);

    const [url, init] = fetchMock.mock.calls[0] as unknown as Call;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-or-test-aaaaaaaa"
    );
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(500);
    expect(body.temperature).toBe(0.1);
  });
});

describe("complete(): рассуждение и причина остановки", () => {
  it("возвращает finishReason и передаёт reasoning.effort для OpenRouter", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "" }, finish_reason: "length" }],
        usage: { prompt_tokens: 1, completion_tokens: 5 },
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_PROVIDER = "openrouter";
    process.env.AI_API_KEY = "sk-or-test-aaaaaaaa";
    process.env.AI_MODEL_STRONG = "vendor/model";
    process.env.AI_REASONING_EFFORT = "low";

    const result = await complete(request);

    expect(result.finishReason).toBe("length");
    const [, init] = fetchMock.mock.calls[0] as unknown as Call;
    expect(JSON.parse(init.body as string).reasoning).toEqual({ effort: "low" });
  });

  it("без AI_REASONING_EFFORT поле reasoning не отправляется", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_PROVIDER = "openrouter";
    process.env.AI_API_KEY = "sk-or-test-aaaaaaaa";
    process.env.AI_MODEL_STRONG = "vendor/model";

    await complete(request);

    const [, init] = fetchMock.mock.calls[0] as unknown as Call;
    expect(JSON.parse(init.body as string)).not.toHaveProperty("reasoning");
  });
});

describe("complete(): ошибки провайдера", () => {
  it("401 на OpenRouter с ключом OpenAI — подсказка о несовпадении и ключ не раскрыт", async () => {
    const key = "sk-proj-secretsecretsecret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => `bad key ${key}`,
      }))
    );
    process.env.AI_PROVIDER = "openrouter";
    process.env.AI_API_KEY = key;
    process.env.AI_MODEL_STRONG = "vendor/model";

    const error = await complete(request).then(() => { throw new Error("ожидалась ошибка"); }, (e: unknown) => e as AiProviderError);

    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.status).toBe(401);
    expect(error.message).toContain("sk-or-");
    expect(error.message).not.toContain(key);
  });

  it("404 — подсказка про модель", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => "model not found",
      }))
    );
    process.env.OPENAI_API_KEY = "sk-test-key-aaaaaaaa";
    process.env.AI_MODEL_STRONG = "no-such-model";

    await expect(complete(request)).rejects.toThrow("модель");
  });

  it("сетевая ошибка превращается в AiProviderError без ключа в тексте", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED sk-test-key-aaaaaaaa");
      })
    );
    process.env.OPENAI_API_KEY = "sk-test-key-aaaaaaaa";
    process.env.AI_MODEL_STRONG = "model-x";

    const error = await complete(request).then(() => { throw new Error("ожидалась ошибка"); }, (e: unknown) => e as AiProviderError);

    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.message).not.toContain("sk-test-key-aaaaaaaa");
  });

  it("ответ не в формате JSON — AiProviderError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
        text: async () => "",
      }))
    );
    process.env.OPENAI_API_KEY = "sk-test-key-aaaaaaaa";
    process.env.AI_MODEL_STRONG = "model-x";

    await expect(complete(request)).rejects.toThrow(AiProviderError);
  });
});

describe("redact", () => {
  it("скрывает известный ключ и ключи по шаблону", () => {
    expect(redact("a custom-secret-value b", "custom-secret-value")).toBe("a *** b");
    expect(redact("sk-or-abcdefghijkl")).toBe("sk-or-***");
    expect(redact("sk-abcdefghijkl")).toBe("sk-***");
  });
});
