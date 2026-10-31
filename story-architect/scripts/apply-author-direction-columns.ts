/**
 * Безопасно добавляет две необязательные колонки для авторского замысла:
 *   Chapter.authorIntent и Project.authorReferences.
 *
 * Только ДОБАВЛЕНИЕ колонок (IF NOT EXISTS): существующие данные не меняются
 * и не удаляются, повторный запуск ничего не ломает.
 *
 * Запуск (из папки story-architect), ДО `npx prisma generate`:
 *   npx tsx scripts/apply-author-direction-columns.ts
 * Если пишет, что не найден DATABASE_URL:
 *   npx tsx --env-file=.env scripts/apply-author-direction-columns.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "Chapter" ADD COLUMN IF NOT EXISTS "authorIntent" JSONB'
  );

  await prisma.$executeRawUnsafe(
    'ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "authorReferences" JSONB'
  );

  const rows = await prisma.$queryRawUnsafe<
    { table_name: string; column_name: string }[]
  >(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE (table_name = 'Chapter' AND column_name = 'authorIntent')
        OR (table_name = 'Project' AND column_name = 'authorReferences')
     ORDER BY table_name`
  );

  const found = rows.map((row) => `${row.table_name}.${row.column_name}`);

  console.log("Найдены колонки:", found.join(", ") || "нет");

  if (found.length !== 2) {
    throw new Error("Ожидалось 2 колонки, проверьте подключение к базе.");
  }

  console.log("Готово. Данные не менялись.");
}

main()
  .catch((error) => {
    console.error("Ошибка:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
