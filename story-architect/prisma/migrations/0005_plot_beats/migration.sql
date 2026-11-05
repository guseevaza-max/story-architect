-- Сюжетная карта: вехи, поля книги и плана раскрытия тайн.
-- Миграция только добавляет: существующие данные не изменяются и не удаляются.

CREATE TYPE "BeatApproval" AS ENUM ('APPROVED', 'APPROXIMATE', 'IDEA');

CREATE TYPE "BeatDisclosure" AS ENUM ('HIDDEN', 'HINTED', 'PARTIAL', 'REVEALED');

ALTER TABLE "Book"
ADD COLUMN "themes" TEXT,
ADD COLUMN "centralConflicts" TEXT,
ADD COLUMN "authorConstraints" TEXT;

ALTER TABLE "Secret"
ADD COLUMN "objectiveTruth" TEXT,
ADD COLUMN "hintFromChapter" INTEGER,
ADD COLUMN "partialRevealChapter" INTEGER,
ADD COLUMN "forbiddenEarly" TEXT;

CREATE TABLE "PlotBeat" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bookId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "narrativeFunction" TEXT,
    "characters" JSONB,
    "causes" TEXT,
    "consequences" TEXT,
    "plannedChapterFrom" INTEGER,
    "plannedChapterTo" INTEGER,
    "approval" "BeatApproval" NOT NULL DEFAULT 'IDEA',
    "disclosure" "BeatDisclosure" NOT NULL DEFAULT 'HIDDEN',
    "relatedArcs" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlotBeat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlotBeat_projectId_bookId_order_idx"
ON "PlotBeat"("projectId", "bookId", "order");

ALTER TABLE "PlotBeat"
ADD CONSTRAINT "PlotBeat_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlotBeat"
ADD CONSTRAINT "PlotBeat_bookId_fkey"
FOREIGN KEY ("bookId") REFERENCES "Book"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
