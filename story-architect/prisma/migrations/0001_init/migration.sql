-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('CANON', 'PROPOSAL', 'DRAFT', 'REJECTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CanonLevel" AS ENUM ('HARD', 'SOFT');

-- CreateEnum
CREATE TYPE "ChapterStatus" AS ENUM ('IDEA', 'PLANNED', 'DRAFT', 'EDITING', 'CHECKING', 'APPROVED', 'CANON');

-- CreateEnum
CREATE TYPE "PlotLineStatus" AS ENUM ('ACTIVE', 'DORMANT', 'RESOLVED', 'ABANDONED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WorldEntityType" AS ENUM ('LOCATION', 'FACTION', 'ORGANIZATION', 'CIVILIZATION', 'SPECIES', 'SYSTEM', 'TECHNOLOGY', 'MAGIC', 'ARTIFACT', 'HISTORICAL_PERIOD', 'CONCEPT', 'EXTERNAL_FORCE');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ProposalOp" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'CANON_CHANGE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('ERROR', 'WARNING', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "AlertPriority" AS ENUM ('CRITICAL', 'IMPORTANT', 'USEFUL', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "KnowledgeHolderType" AS ENUM ('AUTHOR', 'CHARACTER', 'READER');

-- CreateEnum
CREATE TYPE "SecretKind" AS ENUM ('SECRET', 'FORESHADOWING', 'PROMISE');

-- CreateEnum
CREATE TYPE "ForeshadowStatus" AS ENUM ('SEEDED', 'DEVELOPING', 'REVEALED', 'RESOLVED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "StyleScope" AS ENUM ('GLOBAL', 'BOOK', 'ARC', 'CHAPTER', 'SCENE');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'INVALID_OUTPUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FactSource" AS ENUM ('AUTHOR', 'AI_EXTRACTION', 'AI_INFERENCE', 'SEED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "premise" TEXT,
    "genre" TEXT,
    "tone" TEXT,
    "targetAudience" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "projectRules" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "premise" TEXT,
    "mainArc" TEXT,
    "plannedEnding" TEXT,
    "actualEnding" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "purpose" TEXT,
    "status" "ChapterStatus" NOT NULL DEFAULT 'IDEA',
    "authorIdea" TEXT,
    "plan" JSONB,
    "planApproved" BOOLEAN NOT NULL DEFAULT false,
    "draftText" TEXT,
    "finalText" TEXT,
    "summary" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterVersion" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT,
    "plan" JSONB,
    "text" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',
    "plannedOutcome" TEXT,
    "actualOutcome" TEXT,
    "styleOverrideId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "tier" INTEGER NOT NULL DEFAULT 2,
    "description" TEXT,
    "appearance" TEXT,
    "history" TEXT,
    "personality" TEXT,
    "goals" TEXT,
    "fears" TEXT,
    "beliefs" TEXT,
    "values" TEXT,
    "abilities" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'PROPOSAL',
    "canonLevel" "CanonLevel" NOT NULL DEFAULT 'SOFT',
    "sourceChapterId" TEXT,
    "sourceAiRunId" TEXT,
    "sourceProposalId" TEXT,
    "factSource" "FactSource" NOT NULL DEFAULT 'AUTHOR',
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterState" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "chapterId" TEXT,
    "attribute" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB NOT NULL,
    "reason" TEXT,
    "factSource" "FactSource" NOT NULL DEFAULT 'AUTHOR',
    "confidence" DOUBLE PRECISION,
    "status" "RecordStatus" NOT NULL DEFAULT 'CANON',
    "sourceAiRunId" TEXT,
    "sourceProposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterArc" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "bookId" TEXT,
    "name" TEXT NOT NULL,
    "startState" JSONB NOT NULL,
    "currentState" JSONB,
    "targetState" JSONB NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterArc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArcStage" (
    "id" TEXT NOT NULL,
    "arcId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "plannedChapter" INTEGER,
    "actualChapter" INTEGER,
    "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "ArcStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterVoice" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "vocabulary" TEXT,
    "sentenceLength" TEXT,
    "speechRhythm" TEXT,
    "formality" TEXT,
    "humor" TEXT,
    "emotionalExplicit" TEXT,
    "typicalExpressions" JSONB,
    "forbiddenExpressions" JSONB,
    "communicationStyle" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterVoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlotLine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "premise" TEXT,
    "objective" TEXT,
    "currentState" TEXT,
    "participants" JSONB,
    "obstacles" JSONB,
    "plannedResolution" TEXT,
    "actualProgress" TEXT,
    "plotStatus" "PlotLineStatus" NOT NULL DEFAULT 'ACTIVE',
    "status" "RecordStatus" NOT NULL DEFAULT 'PROPOSAL',
    "lastProgressChapter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlotLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlotStage" (
    "id" TEXT NOT NULL,
    "plotLineId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "plannedChapter" INTEGER,
    "actualChapter" INTEGER,
    "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "PlotStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldEntity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "WorldEntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attributes" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'PROPOSAL',
    "canonLevel" "CanonLevel" NOT NULL DEFAULT 'SOFT',
    "factSource" "FactSource" NOT NULL DEFAULT 'AUTHOR',
    "confidence" DOUBLE PRECISION,
    "sourceChapterId" TEXT,
    "sourceAiRunId" TEXT,
    "sourceProposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "explanation" TEXT,
    "canonLevel" "CanonLevel" NOT NULL DEFAULT 'HARD',
    "status" "RecordStatus" NOT NULL DEFAULT 'PROPOSAL',
    "relatedEntities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inWorldDate" TEXT,
    "timeIndex" DOUBLE PRECISION,
    "duration" TEXT,
    "locationId" TEXT,
    "participants" JSONB,
    "cause" TEXT,
    "consequences" TEXT,
    "relatedCharacters" JSONB,
    "relatedPlotLines" JSONB,
    "chapterNumber" INTEGER,
    "status" "RecordStatus" NOT NULL DEFAULT 'PROPOSAL',
    "canonLevel" "CanonLevel" NOT NULL DEFAULT 'SOFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLink" (
    "id" TEXT NOT NULL,
    "causeEventId" TEXT NOT NULL,
    "effectEventId" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "note" TEXT,

    CONSTRAINT "EventLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "value" INTEGER,
    "reason" TEXT,
    "validFromChapter" INTEGER,
    "validToChapter" INTEGER,
    "lastChangedChapter" INTEGER,
    "sourceChapterId" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'PROPOSAL',
    "factSource" "FactSource" NOT NULL DEFAULT 'AUTHOR',
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Secret" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "SecretKind" NOT NULL DEFAULT 'SECRET',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "plannedRevealChapter" INTEGER,
    "revealStatus" "ForeshadowStatus" NOT NULL DEFAULT 'SEEDED',
    "seededChapter" INTEGER,
    "lastReferencedChapter" INTEGER,
    "relatedCharacters" JSONB,
    "relatedEvents" JSONB,
    "relatedPlotLines" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'PROPOSAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Secret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeFact" (
    "id" TEXT NOT NULL,
    "secretId" TEXT NOT NULL,
    "holderType" "KnowledgeHolderType" NOT NULL,
    "characterId" TEXT,
    "knows" BOOLEAN NOT NULL DEFAULT true,
    "sinceChapter" INTEGER,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'CANON',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "aiLinks" JSONB,
    "tags" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenQuestion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonFact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "negation" BOOLEAN NOT NULL DEFAULT false,
    "entityType" TEXT,
    "entityId" TEXT,
    "validFromChapter" INTEGER,
    "validToChapter" INTEGER,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "canonLevel" "CanonLevel" NOT NULL DEFAULT 'SOFT',
    "status" "RecordStatus" NOT NULL DEFAULT 'PROPOSAL',
    "factSource" "FactSource" NOT NULL DEFAULT 'AUTHOR',
    "confidence" DOUBLE PRECISION,
    "sourceChapterId" TEXT,
    "sourceAiRunId" TEXT,
    "sourceProposalId" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryBibleVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryBibleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "op" "ProposalOp" NOT NULL,
    "payload" JSONB NOT NULL,
    "diff" JSONB,
    "reason" TEXT,
    "confidence" DOUBLE PRECISION,
    "safety" TEXT NOT NULL DEFAULT 'UNCERTAIN',
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "aiRunId" TEXT,
    "sourceChapterId" TEXT,
    "impact" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "editedPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "op" "ProposalOp" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "proposalId" TEXT,
    "aiRunId" TEXT,
    "chapterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRole" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "allowedContext" JSONB NOT NULL,
    "allowedActions" JSONB NOT NULL,
    "forbiddenActions" JSONB NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "outputSchema" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generation" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT NOT NULL,
    "roleId" TEXT,
    "roleKey" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cachedTokens" INTEGER,
    "estimatedCost" DECIMAL(12,6),
    "contextSize" INTEGER,
    "contextDebug" JSONB,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "status" "AiRunStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContinuityReport" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "aiRunId" TEXT,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContinuityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContinuityIssue" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "alertType" "AlertType" NOT NULL,
    "priority" "AlertPriority" NOT NULL DEFAULT 'USEFUL',
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "evidence" JSONB,
    "entityRefs" JSONB,
    "explanations" JSONB,
    "confidence" DOUBLE PRECISION,
    "suggestedResolutions" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContinuityIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterSummary" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "shortSummary" TEXT NOT NULL,
    "fullSummary" TEXT,
    "worldDelta" JSONB,
    "aiRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryChunk" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "tokenCount" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleBible" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scope" "StyleScope" NOT NULL DEFAULT 'GLOBAL',
    "scopeId" TEXT,
    "voice" TEXT,
    "pov" TEXT,
    "tense" TEXT,
    "narrativeDistance" TEXT,
    "pacing" TEXT,
    "descriptionDensity" TEXT,
    "dialogueDensity" TEXT,
    "internalThought" TEXT,
    "actionDetail" TEXT,
    "metaphorDensity" TEXT,
    "humor" TEXT,
    "darkness" TEXT,
    "hope" TEXT,
    "tragedy" TEXT,
    "worldbuildingDensity" TEXT,
    "forbiddenPatterns" JSONB,
    "styleCharacteristics" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleBible_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Book_projectId_number_key" ON "Book"("projectId", "number");

-- CreateIndex
CREATE INDEX "Chapter_status_idx" ON "Chapter"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_bookId_number_key" ON "Chapter"("bookId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterVersion_chapterId_version_key" ON "ChapterVersion"("chapterId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_chapterId_order_key" ON "Scene"("chapterId", "order");

-- CreateIndex
CREATE INDEX "Character_projectId_idx" ON "Character"("projectId");

-- CreateIndex
CREATE INDEX "Character_projectId_status_idx" ON "Character"("projectId", "status");

-- CreateIndex
CREATE INDEX "CharacterState_characterId_chapterId_idx" ON "CharacterState"("characterId", "chapterId");

-- CreateIndex
CREATE INDEX "CharacterState_characterId_attribute_idx" ON "CharacterState"("characterId", "attribute");

-- CreateIndex
CREATE INDEX "CharacterArc_characterId_idx" ON "CharacterArc"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "ArcStage_arcId_order_key" ON "ArcStage"("arcId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterVoice_characterId_key" ON "CharacterVoice"("characterId");

-- CreateIndex
CREATE INDEX "PlotLine_projectId_plotStatus_idx" ON "PlotLine"("projectId", "plotStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PlotStage_plotLineId_order_key" ON "PlotStage"("plotLineId", "order");

-- CreateIndex
CREATE INDEX "WorldEntity_projectId_type_idx" ON "WorldEntity"("projectId", "type");

-- CreateIndex
CREATE INDEX "WorldRule_projectId_canonLevel_idx" ON "WorldRule"("projectId", "canonLevel");

-- CreateIndex
CREATE INDEX "Event_projectId_timeIndex_idx" ON "Event"("projectId", "timeIndex");

-- CreateIndex
CREATE UNIQUE INDEX "EventLink_causeEventId_effectEventId_key" ON "EventLink"("causeEventId", "effectEventId");

-- CreateIndex
CREATE INDEX "Relationship_projectId_idx" ON "Relationship"("projectId");

-- CreateIndex
CREATE INDEX "Relationship_sourceId_targetId_relationType_idx" ON "Relationship"("sourceId", "targetId", "relationType");

-- CreateIndex
CREATE INDEX "Secret_projectId_revealStatus_idx" ON "Secret"("projectId", "revealStatus");

-- CreateIndex
CREATE INDEX "KnowledgeFact_secretId_holderType_idx" ON "KnowledgeFact"("secretId", "holderType");

-- CreateIndex
CREATE INDEX "Idea_projectId_idx" ON "Idea"("projectId");

-- CreateIndex
CREATE INDEX "CanonFact_projectId_status_idx" ON "CanonFact"("projectId", "status");

-- CreateIndex
CREATE INDEX "CanonFact_projectId_entityType_entityId_idx" ON "CanonFact"("projectId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryBibleVersion_projectId_version_key" ON "StoryBibleVersion"("projectId", "version");

-- CreateIndex
CREATE INDEX "Proposal_projectId_status_idx" ON "Proposal"("projectId", "status");

-- CreateIndex
CREATE INDEX "ChangeLog_projectId_entityType_entityId_idx" ON "ChangeLog"("projectId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ChangeLog_projectId_createdAt_idx" ON "ChangeLog"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiRole_projectId_key_key" ON "AiRole"("projectId", "key");

-- CreateIndex
CREATE INDEX "AiRun_projectId_createdAt_idx" ON "AiRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_projectId_roleKey_idx" ON "AiRun"("projectId", "roleKey");

-- CreateIndex
CREATE INDEX "ContinuityReport_chapterId_idx" ON "ContinuityReport"("chapterId");

-- CreateIndex
CREATE INDEX "ContinuityIssue_reportId_alertType_idx" ON "ContinuityIssue"("reportId", "alertType");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterSummary_chapterId_key" ON "ChapterSummary"("chapterId");

-- CreateIndex
CREATE INDEX "MemoryChunk_projectId_kind_idx" ON "MemoryChunk"("projectId", "kind");

-- CreateIndex
CREATE INDEX "StyleBible_projectId_scope_idx" ON "StyleBible"("projectId", "scope");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterVersion" ADD CONSTRAINT "ChapterVersion_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_styleOverrideId_fkey" FOREIGN KEY ("styleOverrideId") REFERENCES "StyleBible"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterState" ADD CONSTRAINT "CharacterState_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterState" ADD CONSTRAINT "CharacterState_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterArc" ADD CONSTRAINT "CharacterArc_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcStage" ADD CONSTRAINT "ArcStage_arcId_fkey" FOREIGN KEY ("arcId") REFERENCES "CharacterArc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVoice" ADD CONSTRAINT "CharacterVoice_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotLine" ADD CONSTRAINT "PlotLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotStage" ADD CONSTRAINT "PlotStage_plotLineId_fkey" FOREIGN KEY ("plotLineId") REFERENCES "PlotLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldEntity" ADD CONSTRAINT "WorldEntity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldRule" ADD CONSTRAINT "WorldRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLink" ADD CONSTRAINT "EventLink_causeEventId_fkey" FOREIGN KEY ("causeEventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLink" ADD CONSTRAINT "EventLink_effectEventId_fkey" FOREIGN KEY ("effectEventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFact" ADD CONSTRAINT "KnowledgeFact_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "Secret"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFact" ADD CONSTRAINT "KnowledgeFact_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenQuestion" ADD CONSTRAINT "OpenQuestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonFact" ADD CONSTRAINT "CanonFact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryBibleVersion" ADD CONSTRAINT "StoryBibleVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeLog" ADD CONSTRAINT "ChangeLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AiRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContinuityReport" ADD CONSTRAINT "ContinuityReport_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContinuityIssue" ADD CONSTRAINT "ContinuityIssue_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ContinuityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSummary" ADD CONSTRAINT "ChapterSummary_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryChunk" ADD CONSTRAINT "MemoryChunk_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleBible" ADD CONSTRAINT "StyleBible_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

