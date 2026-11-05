-- Соавтор, этап p34: режим беседы, сжатая сводка длинной беседы, структурированный отчёт критика.
-- Только добавление: существующие беседы получают режим DISCUSSION, сводки нет.

CREATE TYPE "CoauthorMode" AS ENUM ('DISCUSSION', 'CRITIC');

ALTER TABLE "CoauthorThread" ADD COLUMN "mode" "CoauthorMode" NOT NULL DEFAULT 'DISCUSSION';
ALTER TABLE "CoauthorThread" ADD COLUMN "summary" TEXT;
ALTER TABLE "CoauthorThread" ADD COLUMN "summaryUpToAt" TIMESTAMP(3);
ALTER TABLE "CoauthorThread" ADD COLUMN "summaryUpdatedAt" TIMESTAMP(3);

ALTER TABLE "CoauthorMessage" ADD COLUMN "report" JSONB;
