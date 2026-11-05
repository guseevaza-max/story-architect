-- AI Usage: учёт расходов, тарифы моделей и месячный лимит.
-- Только добавляет поля и таблицы, существующие данные не меняются.

-- AlterTable
ALTER TABLE "AiRun" ADD COLUMN "provider" TEXT,
ADD COLUMN "costStatus" TEXT,
ADD COLUMN "costNote" TEXT;

-- CreateTable
CREATE TABLE "AiModelPrice" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputPer1M" DECIMAL(12,6) NOT NULL,
    "outputPer1M" DECIMAL(12,6) NOT NULL,
    "cachedInputPer1M" DECIMAL(12,6),
    "source" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiModelPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyLimitUsd" DECIMAL(12,4) NOT NULL DEFAULT 50,
    "warnPercent" INTEGER NOT NULL DEFAULT 80,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBudgetMonth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "spentUsd" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "assumedUsd" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "reservedUsd" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "unknownCostCalls" INTEGER NOT NULL DEFAULT 0,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBudgetMonth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiModelPrice_provider_model_effectiveFrom_idx" ON "AiModelPrice"("provider", "model", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "AiModelPrice_provider_model_effectiveFrom_key" ON "AiModelPrice"("provider", "model", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "AiBudget_userId_key" ON "AiBudget"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AiBudgetMonth_userId_month_key" ON "AiBudgetMonth"("userId", "month");

-- CreateIndex
CREATE INDEX "AiRun_userId_createdAt_idx" ON "AiRun"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiBudget" ADD CONSTRAINT "AiBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBudgetMonth" ADD CONSTRAINT "AiBudgetMonth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Стартовые тарифы (USD за 1 млн токенов). Источник вторичный (OpenRouter и CloudZero,
-- 2026-11-05): сверьте с кабинетом провайдера и при необходимости обновите на странице AI Usage.
INSERT INTO "AiModelPrice" ("id", "provider", "model", "inputPer1M", "outputPer1M", "cachedInputPer1M", "source") VALUES
  (gen_random_uuid()::text, 'openai', 'gpt-5.6-luna', 0.20, 1.20, 0.02, 'OpenRouter и CloudZero, 2026-11-05; не подтверждено официальной страницей'),
  (gen_random_uuid()::text, 'openai', 'gpt-5.6-terra', 2.00, 12.00, 0.20, 'CloudZero, 2026-11-05; не подтверждено официальной страницей'),
  (gen_random_uuid()::text, 'openai', 'gpt-5.6-sol', 5.00, 30.00, 0.50, 'CloudZero, 2026-11-05; не подтверждено официальной страницей'),
  (gen_random_uuid()::text, 'openrouter', 'openai/gpt-5.6-luna', 0.20, 1.20, 0.02, 'OpenRouter, 2026-11-05')
ON CONFLICT DO NOTHING;
