/**
 * Безопасно добавляет в таблицу Project две необязательные колонки
 * для исходного текста Story Bible.
 *
 * Только ДОБАВЛЕНИЕ колонок (IF NOT EXISTS): существующие данные не меняются
 * и не удаляются, повторный запуск ничего не ломает.
 *
 * Зачем скрипт: `prisma migrate dev` может предложить сбросить базу, если она
 * создавалась не через миграции. Этот скрипт такого риска не несёт.
 *
 * Запуск (из папки story-architect):
 *   npx tsx scripts/apply-story-bible-columns.ts
 * Если пишет, что не найден DATABASE_URL:
 *   npx tsx --env-file=.env scripts/apply-story-bible-columns.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "storyBibleText" TEXT'
  );

  await prisma.$executeRawUnsafe(
    'ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "storyBibleUpdatedAt" TIMESTAMP(3)'
  );

  const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'Project'
       AND column_name IN ('storyBibleText', 'storyBibleUpdatedAt')
     ORDER BY column_name`
  );

  const names = rows.map((row) => row.column_name);

  console.log("Колонки в таблице Project:", names.join(", ") || "не найдены");

  if (names.length !== 2) {
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
