/**
 * Очистка дублей отношений персонажей.
 *
 * ПО УМОЛЧАНИЮ — РЕЖИМ ПРОСМОТРА: ничего не изменяет, только показывает план.
 *
 *   Просмотр:     npx tsx scripts/cleanup-relationship-duplicates.ts
 *   Применить:    npx tsx scripts/cleanup-relationship-duplicates.ts --apply
 *   Откатить:     npx tsx scripts/cleanup-relationship-duplicates.ts --rollback=ФАЙЛ.json
 *
 * Если пишет, что не найден DATABASE_URL, добавьте --env-file=.env:
 *   npx tsx --env-file=.env scripts/cleanup-relationship-duplicates.ts
 *
 * Что делает --apply:
 *  - дубли получают статус REJECTED (из базы НЕ удаляются);
 *  - перекрывающиеся окна глав у победителей закрываются;
 *  - перед изменениями сохраняется файл резервной копии для отката;
 *  - всё выполняется одной транзакцией: либо всё, либо ничего.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  planRelationshipCleanup,
  type CleanupRecord,
} from "../src/lib/canon/relationshipCleanup";

const prisma = new PrismaClient();

type BackupItem = {
  id: string;
  status: "CANON";
  validToChapter: number | null;
};

function clip(text: string | null, limit: number): string {
  if (!text) return "—";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

async function rollback(file: string) {
  const items = JSON.parse(readFileSync(file, "utf8")) as BackupItem[];

  await prisma.$transaction(
    items.map((item) =>
      prisma.relationship.update({
        where: { id: item.id },
        data: { status: item.status, validToChapter: item.validToChapter },
      })
    )
  );

  console.log(`Откат выполнен: восстановлено записей — ${items.length}.`);
}

async function main() {
  const args = process.argv.slice(2);
  const rollbackArg = args.find((a) => a.startsWith("--rollback="));

  if (rollbackArg) {
    await rollback(rollbackArg.slice("--rollback=".length));
    return;
  }

  const apply = args.includes("--apply");

  const found = await prisma.relationship.findMany({
    where: { status: "CANON" },
    include: {
      project: { select: { name: true } },
      source: { select: { name: true } },
      target: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, { title: string; rows: typeof found }>();

  for (const r of found) {
    const key = [
      r.projectId,
      r.sourceId,
      r.targetId,
      r.relationType.trim().toLowerCase(),
    ].join("|");

    const group = groups.get(key) ?? {
      title: `Проект «${r.project.name}»: ${r.source.name} → ${r.target.name} [${r.relationType}]`,
      rows: [],
    };

    group.rows.push(r);
    groups.set(key, group);
  }

  const backup: BackupItem[] = [];
  const rejectOps: string[] = [];
  const closeOps: { id: string; validToChapter: number }[] = [];

  for (const group of groups.values()) {
    const records: CleanupRecord[] = group.rows.map((r) => ({
      id: r.id,
      validFromChapter: r.validFromChapter,
      validToChapter: r.validToChapter,
      createdAt: r.createdAt,
    }));

    const plan = planRelationshipCleanup(records);

    if (plan.rejectIds.length === 0 && plan.closeUpdates.length === 0) {
      continue;
    }

    console.log("");
    console.log(group.title);

    const byId = new Map(group.rows.map((r) => [r.id, r]));

    for (const id of plan.keepIds) {
      const r = byId.get(id);
      const close = plan.closeUpdates.find((c) => c.id === id);
      if (!r) continue;

      const to = close
        ? `${close.validToChapter} (было: ${close.previousValidTo ?? "сейчас"})`
        : (r.validToChapter ?? "сейчас");

      console.log(
        `  ОСТАЁТСЯ  ${id} | главы ${r.validFromChapter ?? "начала"} → ${to} | ${clip(r.reason, 70)}`
      );
    }

    for (const id of plan.rejectIds) {
      const r = byId.get(id);
      if (!r) continue;

      console.log(
        `  ОТКЛОНИТЬ ${id} | главы ${r.validFromChapter ?? "начала"} → ${r.validToChapter ?? "сейчас"} | ${clip(r.reason, 70)}`
      );

      rejectOps.push(id);
      backup.push({
        id,
        status: "CANON",
        validToChapter: r.validToChapter,
      });
    }

    for (const c of plan.closeUpdates) {
      closeOps.push({ id: c.id, validToChapter: c.validToChapter });
      backup.push({
        id: c.id,
        status: "CANON",
        validToChapter: c.previousValidTo,
      });
    }
  }

  console.log("");
  console.log("==============================================");
  console.log(`Будет отклонено дублей: ${rejectOps.length}`);
  console.log(`Будет закрыто перекрывающихся окон: ${closeOps.length}`);

  if (rejectOps.length === 0 && closeOps.length === 0) {
    console.log("Менять нечего.");
    return;
  }

  if (!apply) {
    console.log("РЕЖИМ ПРОСМОТРА: ничего не изменено.");
    console.log("Чтобы применить, запустите с флагом --apply");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = `relationship-cleanup-backup-${stamp}.json`;
  writeFileSync(backupFile, JSON.stringify(backup, null, 2), "utf8");
  console.log(`Резервная копия сохранена: ${backupFile}`);

  await prisma.$transaction([
    ...(rejectOps.length > 0
      ? [
          prisma.relationship.updateMany({
            where: { id: { in: rejectOps } },
            data: { status: "REJECTED" },
          }),
        ]
      : []),
    ...closeOps.map((c) =>
      prisma.relationship.update({
        where: { id: c.id },
        data: { validToChapter: c.validToChapter },
      })
    ),
  ]);

  console.log("Готово. Для отката:");
  console.log(
    `  npx tsx scripts/cleanup-relationship-duplicates.ts --rollback=${backupFile}`
  );
}

main()
  .catch((error) => {
    console.error("Ошибка очистки:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
