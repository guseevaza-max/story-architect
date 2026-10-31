#!/usr/bin/env node
/**
 * Добавляет кнопку «Извлечь факты» в интерфейс Lore Library
 * (src/app/projects/[id]/lore/LoreLibrary.tsx).
 *
 * Скрипт ищет в файле кнопку «Удалить» и вставляет перед ней компонент
 * <ExtractFactsButton />, определяя имена переменных по самому файлу.
 * Если структура файла другая, скрипт НИЧЕГО не меняет и объясняет, что
 * нужно сделать.
 *
 *   node scripts/integrate-lore-extract.mjs --check   # только проверка
 *   node scripts/integrate-lore-extract.mjs           # внести изменения
 *
 * Копия исходного файла сохраняется в .lore-extract-backup/.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const checkOnly = process.argv.includes("--check");
const rel = join("src", "app", "projects", "[id]", "lore", "LoreLibrary.tsx");
const path = join(process.cwd(), rel);

function fail(message) {
  console.log(`✗ ${message}`);
  process.exit(1);
}

if (!existsSync(path)) fail(`Не найден файл ${rel}`);
if (!existsSync(join(process.cwd(), "src", "app", "projects", "[id]", "lore", "ExtractFactsButton.tsx"))) {
  fail("Сначала добавьте файл ExtractFactsButton.tsx (часть патча).");
}

const text = readFileSync(path, "utf8");

if (text.includes("ExtractFactsButton")) {
  console.log("✓ Кнопка уже добавлена, ничего не делаю.");
  process.exit(0);
}

// Переменная материала: key={material.id}
const keyMatch = /key=\{\s*(\w+)\.id\s*\}/.exec(text);
if (!keyMatch) fail("Не нашёл элемент списка с key={…id}: не могу определить переменную материала.");
const item = keyMatch[1];

// Идентификатор проекта: проп или переменная projectId
if (!/\bprojectId\b/.test(text)) fail("Не нашёл переменную projectId в LoreLibrary.tsx.");

// Кнопка «Удалить»
const deleteButton = /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*?Удалить(?:(?!<\/button>)[\s\S])*?<\/button>/.exec(text);
if (!deleteButton) fail("Не нашёл кнопку «Удалить»: вставьте <ExtractFactsButton projectId={projectId} materialId={" + item + ".id} /> рядом с действиями материала вручную.");

const usage = `<ExtractFactsButton projectId={projectId} materialId={${item}.id} />\n`;
let next = text.slice(0, deleteButton.index) + usage + text.slice(deleteButton.index);

// Импорт после последнего import
const imports = [...next.matchAll(/^import .*;$/gm)];
const importLine = 'import ExtractFactsButton from "./ExtractFactsButton";';
if (imports.length > 0) {
  const last = imports[imports.length - 1];
  const at = last.index + last[0].length;
  next = next.slice(0, at) + "\n" + importLine + next.slice(at);
} else {
  next = next.replace(/^("use client";\s*)/, `$1\n${importLine}\n`);
}

console.log(`✓ Найдено: материал «${item}», кнопка «Удалить». Вставка перед ней.`);

if (checkOnly) {
  console.log("Режим проверки: файл не изменён.");
  process.exit(0);
}

const backup = join(process.cwd(), ".lore-extract-backup", rel);
mkdirSync(dirname(backup), { recursive: true });
copyFileSync(path, backup);
writeFileSync(path, next, "utf8");

console.log("Готово. Копия исходного файла: .lore-extract-backup/");
