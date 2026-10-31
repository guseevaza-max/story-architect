-- Авторский замысел главы и библиотека референсов проекта.
-- Только добавление двух необязательных колонок: существующие данные не затрагиваются.
-- IF NOT EXISTS делает миграцию безопасной при повторном запуске.
ALTER TABLE "Chapter" ADD COLUMN IF NOT EXISTS "authorIntent" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "authorReferences" JSONB;
