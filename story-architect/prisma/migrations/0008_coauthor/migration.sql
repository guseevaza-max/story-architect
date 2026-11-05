-- Соавтор: беседы и сообщения. Только добавление новых типов и таблиц,
-- существующие данные не затрагиваются.

CREATE TYPE "CoauthorScope" AS ENUM ('PROJECT', 'TOPIC', 'CHAPTER');
CREATE TYPE "CoauthorRole" AS ENUM ('AUTHOR', 'COAUTHOR');
CREATE TYPE "CoauthorTier" AS ENUM ('LUNA', 'TERRA');

CREATE TABLE "CoauthorThread" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" "CoauthorScope" NOT NULL DEFAULT 'TOPIC',
    "chapterId" TEXT,
    "defaultTier" "CoauthorTier" NOT NULL DEFAULT 'LUNA',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoauthorThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoauthorMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "CoauthorRole" NOT NULL,
    "text" TEXT NOT NULL,
    "tier" "CoauthorTier",
    "provider" TEXT,
    "model" TEXT,
    "aiRunId" TEXT,
    "containsSpoiler" BOOLEAN NOT NULL DEFAULT false,
    "fragmentChapterId" TEXT,
    "fragmentText" TEXT,
    "fragmentStart" INTEGER,
    "fragmentEnd" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoauthorMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoauthorThread_projectId_userId_archivedAt_updatedAt_idx" ON "CoauthorThread"("projectId", "userId", "archivedAt", "updatedAt");
CREATE INDEX "CoauthorThread_chapterId_idx" ON "CoauthorThread"("chapterId");
CREATE INDEX "CoauthorMessage_threadId_createdAt_idx" ON "CoauthorMessage"("threadId", "createdAt");
CREATE INDEX "CoauthorMessage_aiRunId_idx" ON "CoauthorMessage"("aiRunId");

ALTER TABLE "CoauthorThread" ADD CONSTRAINT "CoauthorThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoauthorThread" ADD CONSTRAINT "CoauthorThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoauthorThread" ADD CONSTRAINT "CoauthorThread_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoauthorMessage" ADD CONSTRAINT "CoauthorMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CoauthorThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
