import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Архитектурный тест (ТЗ п. 58).
 * Проверяет границу модулей независимо от ESLint: ни один файл AI-слоя
 * не импортирует модуль записи канона.
 */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("Граница AI ↛ Canon", () => {
  it("AI-слой не импортирует lib/canon/write", () => {
    const offenders = walk("src/lib/ai")
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .filter((f) => /from\s+["'][^"']*canon\/write["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("ключ API читается только в слое провайдера", () => {
    const offenders = walk("src")
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .filter((f) => !f.includes(join("lib", "ai", "provider")))
      .filter((f) => readFileSync(f, "utf8").includes("AI_API_KEY"));
    expect(offenders).toEqual([]);
  });
});
