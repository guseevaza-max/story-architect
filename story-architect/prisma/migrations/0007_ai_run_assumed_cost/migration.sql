-- AI Usage: отдельное поле для оценочной суммы, учтённой в лимите, когда
-- фактическая стоимость вызова неизвестна. Только добавляет колонку.

-- AlterTable
ALTER TABLE "AiRun" ADD COLUMN "assumedCost" DECIMAL(12,6);
