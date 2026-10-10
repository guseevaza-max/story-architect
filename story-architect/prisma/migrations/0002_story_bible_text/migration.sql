-- Исходный текст Story Bible на уровне проекта.
-- Только добавление двух необязательных колонок: существующие данные не затрагиваются.
-- IF NOT EXISTS делает миграцию безопасной при повторном запуске.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "storyBibleText" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "storyBibleUpdatedAt" TIMESTAMP(3);
