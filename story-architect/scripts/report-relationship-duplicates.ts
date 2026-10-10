/**
 * Отчёт о возможных дублях отношений персонажей.
 *
 * ТОЛЬКО ЧТЕНИЕ: скрипт ничего не изменяет и не удаляет.
 *
 * Запуск (из папки story-architect):
 *   npx tsx scripts/report-relationship-duplicates.ts
 * Если пишет, что не найден DATABASE_URL:
 *   npx tsx --env-file=.env scripts/report-relationship-duplicates.ts
 *
 * Отношение определяется ключом «источник → цель + тип».
 * Направление важно: Каэль → Марк и Марк → Каэль — разные отношения.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Row = {
  id: string;
  projectName: string;
  sourceName: string;
  targetName: string;
  relationType: string;
  validFromChapter: number | null;
  validToChapter: number | null;
  reason: string | null;
  createdAt: Date;
};

function clip(text: string | null, limit: number): string {
  if (!text) return "—";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

function windowText(row: Row): string {
  const from = row.validFromChapter ?? "начала";
  const to = row.validToChapter === null ? "сейчас" : row.validToChapter;
  return `главы ${from} → ${to}`;
}

function overlaps(a: Row, b: Row): boolean {
  const aFrom = a.validFromChapter ?? Number.NEGATIVE_INFINITY;
  const aTo = a.validToChapter ?? Number.POSITIVE_INFINITY;
  const bFrom = b.validFromChapter ?? Number.NEGATIVE_INFINITY;
  const bTo = b.validToChapter ?? Number.POSITIVE_INFINITY;

  return aFrom <= bTo && bFrom <= aTo;
}

async function main() {
  const found = await prisma.relationship.findMany({
    where: { status: "CANON" },
    include: {
      project: { select: { name: true } },
      source: { select: { name: true } },
      target: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, Row[]>();

  for (const r of found) {
    const key = [
      r.projectId,
      r.sourceId,
      r.targetId,
      r.relationType.trim().toLowerCase(),
    ].join("|");

    const row: Row = {
      id: r.id,
      projectName: r.project.name,
      sourceName: r.source.name,
      targetName: r.target.name,
      relationType: r.relationType,
      validFromChapter: r.validFromChapter,
      validToChapter: r.validToChapter,
      reason: r.reason,
      createdAt: r.createdAt,
    };

    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  let problemGroups = 0;
  let extraActive = 0;

  for (const rows of groups.values()) {
    const active = rows.filter((r) => r.validToChapter === null);

    let overlapping = false;
    for (let i = 0; i < rows.length && !overlapping; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        if (a && b && overlaps(a, b)) {
          overlapping = true;
          break;
        }
      }
    }

    if (active.length <= 1 && !overlapping) continue;

    problemGroups++;
    extraActive += Math.max(active.length - 1, 0);

    const first = rows[0];
    if (!first) continue;

    console.log("");
    console.log(
      `Проект «${first.projectName}»: ${first.sourceName} → ${first.targetName} [${first.relationType}]`
    );
    console.log(
      `  действующих записей: ${active.length}, всего записей: ${rows.length}` +
        (overlapping ? ", окна глав пересекаются" : "")
    );

    for (const r of rows) {
      console.log(
        `  - ${r.id} | ${windowText(r)} | создана ${r.createdAt.toISOString().slice(0, 10)} | ${clip(r.reason, 80)}`
      );
    }
  }

  console.log("");
  console.log("==============================================");
  console.log(`Всего отношений Canon: ${found.length}`);
  console.log(`Пар с проблемой (дубли или пересечения): ${problemGroups}`);
  console.log(`Лишних действующих записей: ${extraActive}`);
  console.log("Скрипт ничего не изменял.");
}

main()
  .catch((error) => {
    console.error("Ошибка отчёта:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
