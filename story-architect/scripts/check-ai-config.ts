/**
 * Проверка настроек AI для complete() (Lore Extraction).
 * Ничего не записывает, ключ не печатает. Запуск из папки story-architect:
 *   npx tsx scripts/check-ai-config.ts          — проверить ключ и список моделей
 *   npx tsx scripts/check-ai-config.ts --ping   — ещё и отправить крошечный запрос
 */
import { existsSync, readFileSync } from "node:fs";

function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2] ?? "";
    v = v.startsWith('"') ? (v.split('"')[1] ?? "") : v.replace(/\s+#.*$/, "").trim();
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = v;
  }
}

loadDotEnv(".env");

const e = (n: string) => (process.env[n] ?? "").trim();
const explicit = e("AI_PROVIDER").toLowerCase();
const rawBase = e("AI_BASE_URL").replace(/\/+$/, "");
const provider =
  explicit === "openrouter" || explicit === "custom" || explicit === "openai"
    ? explicit
    : /openrouter\.ai/.test(rawBase)
      ? "openrouter"
      : rawBase && !/api\.openai\.com/.test(rawBase)
        ? "custom"
        : "openai";
const baseUrl =
  rawBase ||
  (provider === "openai"
    ? "https://api.openai.com/v1"
    : provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : "");
const keyVar =
  (provider === "openai" ? ["OPENAI_API_KEY", "AI_API_KEY"] : ["AI_API_KEY", "OPENAI_API_KEY"]).find(
    (n) => e(n)
  ) ?? "";
const key = keyVar ? e(keyVar) : "";
const model = e("AI_MODEL_STRONG");

let problems = 0;
const bad = (m: string) => {
  problems++;
  console.log(`✗ ${m}`);
};

console.log(`Провайдер: ${provider}`);
console.log(`Адрес:     ${baseUrl || "(не задан)"}`);
console.log(
  `Ключ:      ${key ? `${keyVar}, ${key.startsWith("sk-or-") ? "формат OpenRouter" : key.startsWith("sk-") ? "формат OpenAI" : "другой формат"}, длина ${key.length}` : "не задан"}`
);
console.log(`Модель:    ${model || "(AI_MODEL_STRONG не задана)"}\n`);

if (!key) bad("Ключ не задан: для OpenAI нужен OPENAI_API_KEY.");
if (!baseUrl) bad("Не задан AI_BASE_URL (нужен для AI_PROVIDER=custom).");
if (!model) bad("Не задана AI_MODEL_STRONG.");
if (provider === "openrouter" && key && !key.startsWith("sk-or-"))
  bad("Для OpenRouter нужен ключ sk-or-..., а это другой ключ. Для OpenAI поставьте AI_PROVIDER=openai и очистите AI_BASE_URL.");
if (provider === "openai" && key.startsWith("sk-or-"))
  bad("Это ключ OpenRouter, а провайдер openai.");

async function main() {
  if (!key || !baseUrl) return;
  const headers = { Authorization: `Bearer ${key}` };

  try {
    const res = await fetch(`${baseUrl}/models`, { headers });
    if (!res.ok) {
      bad(`GET /models вернул ${res.status}. ${res.status === 401 ? "Провайдер не принял ключ." : ""}`);
      return;
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    const ids = (data.data ?? []).map((m) => m.id);
    console.log(`✓ Ключ принят, моделей доступно: ${ids.length}`);

    if (model && !ids.includes(model)) {
      const needle = model.toLowerCase().split(/[\/\-]/)[0] ?? "";
      const similar = ids.filter((i) => i.toLowerCase().includes(needle)).slice(0, 15);
      bad(`Модель «${model}» не найдена у провайдера.`);
      if (similar.length) console.log(`  Похожие: ${similar.join(", ")}`);
      else console.log(`  Примеры доступных: ${ids.slice(0, 15).join(", ")}`);
    } else if (model) {
      console.log(`✓ Модель «${model}» доступна.`);
    }
  } catch (err) {
    bad(`Нет связи с провайдером: ${(err instanceof Error ? err.message : String(err)).replaceAll(key, "***")}`);
    return;
  }

  if (process.argv.includes("--ping") && model && problems === 0) {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: "Ответь одним словом: ок" }],
    };
    body[provider === "openai" ? "max_completion_tokens" : "max_tokens"] = 20;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) console.log("✓ Тестовый запрос выполнен.");
    else bad(`Тестовый запрос вернул ${res.status}: ${(await res.text()).slice(0, 300).replaceAll(key, "***")}`);
  }
}

main().then(() => {
  console.log(problems ? `\nПроблем: ${problems}` : "\nВсё в порядке.");
  process.exit(problems ? 1 : 0);
});
