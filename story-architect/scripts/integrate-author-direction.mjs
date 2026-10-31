#!/usr/bin/env node
/**
 * Интеграция авторского замысла в четыре маршрута генерации:
 *   architect, scene-planner, writer, continuity.
 *
 * Скрипт НЕ применяет патч целиком: он вносит в ваши ТЕКУЩИЕ файлы только
 * нужные вставки, ориентируясь на якорные фрагменты кода, и не зависит от
 * форматирования (пробелы и переносы строк не важны).
 *
 * Безопасность:
 *  - режим --check ничего не меняет, только показывает, что будет сделано;
 *  - файл изменяется только если найдены ВСЕ его якоря (иначе не трогается);
 *  - перед записью копия файла сохраняется в .author-direction-backup/;
 *  - повторный запуск безопасен: уже интегрированные файлы пропускаются;
 *  - Git не используется, ничего не коммитится.
 *
 * Запуск из папки story-architect:
 *   node scripts/integrate-author-direction.mjs --check
 *   node scripts/integrate-author-direction.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");

const base = join("src", "app", "api", "projects", "[id]", "chapters", "[chapterId]");

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Регулярное выражение по токенам: любые пробелы и переносы между ними допустимы. */
function flex(snippet) {
  return new RegExp(snippet.trim().split(/\s+/).map(escape).join("\\s+"), "g");
}

const LOAD_IMPORT = 'import { loadAuthorDirectionBlock } from "@/lib/authorIntent/load";';
const AUTH_IMPORT = 'import { auth } from "@/auth";';

const withImport = (extra = "") => ({
  name: "импорт",
  find: AUTH_IMPORT,
  replace: `${AUTH_IMPORT}\n${LOAD_IMPORT}${extra ? `\n${extra}` : ""}`,
});

const promptEdit = {
  name: "блок замысла в промпте",
  find: "${storyState}",
  replace: "${storyState}${authorBlock}",
};

const files = [
  {
    path: join(base, "architect", "route.ts"),
    edits: [
      withImport(),
      {
        name: "загрузка замысла",
        find: [
          "const storyState = storyStats.text;",
          "const storyState = await buildStoryState(storyRef);",
        ],
        replace: `{{ANCHOR}}

    // Авторский замысел главы и референсы (пустая строка, если не заданы).
    const authorBlock = await loadAuthorDirectionBlock(
      project.id,
      chapter.id,
      "architect"
    );`,
      },
      promptEdit,
    ],
  },
  {
    path: join(base, "scene-planner", "route.ts"),
    edits: [
      withImport(),
      {
        name: "загрузка замысла",
        find: "chapterNumber: chapter.number, });",
        replace: `chapterNumber: chapter.number,
    });

    // Авторский замысел главы и референсы (пустая строка, если не заданы).
    const authorBlock = await loadAuthorDirectionBlock(
      project.id,
      chapter.id,
      "scene_planner"
    );`,
      },
      promptEdit,
    ],
  },
  {
    path: join(base, "writer", "route.ts"),
    edits: [
      withImport('import { splitAuthorNotes } from "@/lib/authorIntent/prompt";'),
      {
        name: "параллельная загрузка (начало)",
        find: "const [canonFacts, previousChapter, memoryChunks, storyState] = await Promise.all([",
        replace:
          "const [canonFacts, previousChapter, memoryChunks, storyState, authorBlock] =\n      await Promise.all([",
      },
      {
        name: "параллельная загрузка (конец)",
        find: "buildStoryState(storyRef), ]);",
        replace: `buildStoryState(storyRef),

      // Авторский замысел главы и референсы (пустая строка, если не заданы).
      loadAuthorDirectionBlock(project.id, chapter.id, "writer"),
    ]);`,
      },
      promptEdit,
      {
        name: "сырой ответ модели",
        find: "const draftText = response.output_text?.trim(); if (!draftText) {",
        replace: "const rawDraft = response.output_text?.trim(); if (!rawDraft) {",
      },
      {
        name: "отделение замечаний для автора",
        find: "const wordCount = draftText.split(/\\s+/).filter(Boolean).length;",
        replace: `// Раздел «Замечания для автора» (конфликт замысла с Canon) не попадает
    // в текст главы, а возвращается отдельно.
    const { text: draftText, notes: authorNotes } = splitAuthorNotes(rawDraft);

    const wordCount = draftText.split(/\\s+/).filter(Boolean).length;`,
      },
      {
        name: "ответ с замечаниями",
        find: "draftText, wordCount, }); } catch",
        replace: `draftText,
      wordCount,
      authorNotes,
    });
  } catch`,
      },
    ],
  },
  {
    path: join(base, "continuity", "route.ts"),
    edits: [
      withImport(),
      {
        name: "загрузка принципа",
        find: "const userPrompt = `",
        replace: `// Только принцип: художественные предпочтения автора не являются фактами.
    const authorBlock = await loadAuthorDirectionBlock(
      project.id,
      chapter.id,
      "continuity"
    );

    const userPrompt = \``,
      },
      promptEdit,
    ],
  },
];

// Нужные для работы файлы, которые должны уже существовать (часть патча p12).
const required = [
  join("src", "lib", "authorIntent", "load.ts"),
  join("src", "lib", "authorIntent", "prompt.ts"),
  join("src", "lib", "authorIntent", "schema.ts"),
];

let failed = false;

console.log(checkOnly ? "РЕЖИМ ПРОВЕРКИ: файлы не изменяются\n" : "Интеграция авторского замысла\n");

for (const file of required) {
  if (!existsSync(join(root, file))) {
    console.log(`✗ Нет файла ${file}: сначала добавьте новые файлы патча p12.`);
    failed = true;
  }
}

for (const file of files) {
  const fullPath = join(root, file.path);

  if (!existsSync(fullPath)) {
    console.log(`✗ ${file.path}: файл не найден`);
    failed = true;
    continue;
  }

  let text = readFileSync(fullPath, "utf8");

  if (text.includes("loadAuthorDirectionBlock")) {
    console.log(`✓ ${file.path}: уже интегрировано, пропускаю`);
    continue;
  }

  const problems = [];
  let next = text;

  for (const edit of file.edits) {
    const alternatives = Array.isArray(edit.find) ? edit.find : [edit.find];
    let applied = false;
    let lastCount = 0;

    for (const anchor of alternatives) {
      const pattern = flex(anchor);
      const matches = next.match(pattern) ?? [];
      lastCount = Math.max(lastCount, matches.length);

      if (matches.length === 1) {
        const original = matches[0];
        next = next.replace(pattern, () =>
          edit.replace.replace("{{ANCHOR}}", () => original)
        );
        applied = true;
        break;
      }
    }

    if (!applied) {
      problems.push(
        `${edit.name}: ${lastCount === 0 ? "якорь не найден" : `якорь найден ${lastCount} раза, нужен ровно один`}`
      );
    }
  }

  if (problems.length > 0) {
    failed = true;
    console.log(`✗ ${file.path}: НЕ изменён`);
    problems.forEach((problem) => console.log(`    - ${problem}`));
    continue;
  }

  if (checkOnly) {
    console.log(`✓ ${file.path}: можно интегрировать (${file.edits.length} вставок)`);
    continue;
  }

  const backup = join(root, ".author-direction-backup", file.path);
  mkdirSync(dirname(backup), { recursive: true });
  copyFileSync(fullPath, backup);
  writeFileSync(fullPath, next, "utf8");

  console.log(`✓ ${file.path}: интегрировано (${file.edits.length} вставок), копия в .author-direction-backup/`);
}

console.log(failed ? "\nЕсть проблемы: исправления внесены только в файлы без ошибок." : "\nГотово.");
process.exit(failed ? 1 : 0);
