import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AiProviderError, complete } from "../src/lib/ai/provider";

const names = [
  "OPENAI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL_STRONG",
  "AI_MOCK",
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
  messages: [{ role: "user" as const, content: "привет" }],
};

describe("complete(): проверка настроек до обращения к сети", () => {
  it("без ключа — понятная ошибка, сеть не используется", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.AI_MODEL_STRONG = "model-x";
    process.env.AI_BASE_URL = "https://api.example.com/v1";

    await expect(complete(request)).rejects.toThrow(AiProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("без AI_MODEL_STRONG — ошибка, сеть не используется", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.OPENAI_API_KEY = "sk-test-key-aaaaaaaa";
    process.env.AI_BASE_URL = "https://api.example.com/v1";

    await expect(complete(request)).rejects.toThrow(AiProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("без AI_BASE_URL — понятная ошибка вместо обращения к относительному адресу", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.OPENAI_API_KEY = "sk-test-key-aaaaaaaa";
    process.env.AI_MODEL_STRONG = "model-x";

    await expect(complete(request)).rejects.toThrow("AI_BASE_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("при полной настройке обращается к заданному адресу с ключом из OPENAI_API_KEY", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.OPENAI_API_KEY = "sk-test-key-aaaaaaaa";
    process.env.AI_BASE_URL = "https://api.example.com/v1/";
    process.env.AI_MODEL_STRONG = "model-x";

    const result = await complete(request);

    expect(result.text).toBe("{}");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test-key-aaaaaaaa"
    );
  });
});
