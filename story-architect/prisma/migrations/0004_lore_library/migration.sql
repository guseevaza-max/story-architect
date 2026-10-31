CREATE TABLE "LoreMaterial" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoreMaterial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoreMaterial_projectId_updatedAt_idx"
ON "LoreMaterial"("projectId", "updatedAt");

ALTER TABLE "LoreMaterial"
ADD CONSTRAINT "LoreMaterial_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
