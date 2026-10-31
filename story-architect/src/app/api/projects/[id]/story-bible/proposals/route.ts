import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { proposalPayloadSchema } from "@/lib/schemas/proposal";
import {
  buildProposalDrafts,
  emptyExistingSets,
  normalizeName,
  type DraftCategory,
  type DraftEntityType,
  type ExistingSets,
  type ProposalDraft,
} from "@/lib/storyBible/analysisToProposals";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const itemList = z.array(z.string().max(4000)).max(200).optional();

const candidateSchema = z.object({
  kind: z.enum([
    "character",
    "unnamed_figure",
    "location",
    "faction",
    "state_or_realm",
    "government_body",
    "abstract_concept",
    "world_rule",
    "event",
    "plot_line",
    "consequence_or_fact",
    "other",
  ]),
  name: z.string().max(300),
  description: z.string().max(4000).default(""),
  evidence: z.string().max(1000).default(""),
  confidence: z.number().min(0).max(1).default(0.5),
  isOngoing: z.boolean().default(false),
  eventGroup: z.string().max(200).default(""),
  cause: z.string().max(2000).default(""),
  consequences: z.string().max(2000).default(""),
  inWorldDate: z.string().max(200).default(""),
});

const bodySchema = z.object({
  analysis: z.object({
    candidates: z.array(candidateSchema).max(300).optional(),
    facts: itemList,
    characters: itemList,
    locations: itemList,
    factions: itemList,
    worldRules: itemList,
    events: itemList,
    relationships: itemList,
    secrets: itemList,
    plotLines: itemList,
    openQuestions: itemList,
  }),
});

const ENTITY_TYPES: DraftEntityType[] = [
  "CHARACTER",
  "WORLD_ENTITY",
  "WORLD_RULE",
  "PLOT_LINE",
  "EVENT",
  "OPEN_QUESTION",
];

function nameFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const data = (payload as { data?: unknown }).data;

  if (!data || typeof data !== "object") return null;

  const record = data as { name?: unknown; question?: unknown };
  const name = record.name ?? record.question;

  return typeof name === "string" && name.trim() ? name : null;
}

/**
 * Превращает результат анализа Story Bible в ПРЕДЛОЖЕНИЯ автору.
 * Canon не изменяется: всё создаётся со статусом PENDING и ждёт решения.
 * Каждая категория обрабатывается независимо: ошибка одной не скрывает
 * результаты остальных.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    const body: unknown = await request.json().catch(() => null);
    const parsedBody = bodySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Некорректный результат анализа." },
        { status: 400 }
      );
    }

    // Что уже есть в проекте: Canon, ожидающие и отклонённые предложения.
    const [
      characters,
      worldEntities,
      worldRules,
      plotLines,
      events,
      openQuestions,
      proposals,
    ] = await Promise.all([
        prisma.character.findMany({
          where: { projectId: project.id, status: "CANON" },
          select: { name: true },
        }),
        prisma.worldEntity.findMany({
          where: { projectId: project.id, status: "CANON" },
          select: { name: true },
        }),
        prisma.worldRule.findMany({
          where: { projectId: project.id, status: "CANON" },
          select: { name: true },
        }),
        prisma.plotLine.findMany({
          where: { projectId: project.id, status: "CANON" },
          select: { name: true },
        }),
        prisma.event.findMany({
          where: { projectId: project.id, status: "CANON" },
          select: { name: true },
        }),
        prisma.openQuestion.findMany({
          where: { projectId: project.id, status: { not: "REJECTED" } },
          select: { question: true },
        }),
        prisma.proposal.findMany({
          where: {
            projectId: project.id,
            entityType: { in: ENTITY_TYPES },
            status: { in: ["PENDING", "REJECTED"] },
          },
          select: { entityType: true, status: true, payload: true },
        }),
      ]);

    const existing: ExistingSets = emptyExistingSets();

    const addAll = (
      type: DraftEntityType,
      rows: { name: string }[]
    ) => {
      rows.forEach((row) => existing.canon[type].add(normalizeName(row.name)));
    };

    addAll("CHARACTER", characters);
    addAll("WORLD_ENTITY", worldEntities);
    addAll("WORLD_RULE", worldRules);
    addAll("PLOT_LINE", plotLines);
    addAll("EVENT", events);

    openQuestions.forEach((row) =>
      existing.canon.OPEN_QUESTION.add(normalizeName(row.question))
    );

    for (const proposal of proposals) {
      const name = nameFromPayload(proposal.payload);

      if (!name) continue;

      const type = proposal.entityType as DraftEntityType;
      const bucket =
        proposal.status === "REJECTED" ? existing.rejected : existing.pending;

      bucket[type]?.add(normalizeName(name));
    }

    const { drafts, skipped, notMapped } = buildProposalDrafts(
      parsedBody.data.analysis,
      existing
    );

    // Группируем по категориям: каждая создаётся отдельной транзакцией.
    const byCategory = new Map<DraftCategory, ProposalDraft[]>();

    for (const draft of drafts) {
      const list = byCategory.get(draft.category) ?? [];
      list.push(draft);
      byCategory.set(draft.category, list);
    }

    const created: Partial<Record<DraftCategory, number>> = {};
    const failed: { category: DraftCategory; error: string }[] = [];

    for (const [category, list] of byCategory) {
      try {
        const valid = list.map((draft) => {
          const parsed = proposalPayloadSchema.safeParse(draft.payload);

          if (!parsed.success) {
            throw new Error(`Некорректные данные: «${draft.name}»`);
          }

          return { draft, payload: parsed.data };
        });

        await prisma.$transaction(
          valid.map(({ draft, payload }) =>
            prisma.proposal.create({
              data: {
                projectId: project.id,
                entityType: draft.entityType,
                op: "CREATE",
                payload: payload as Prisma.InputJsonValue,
                reason: draft.reason,
                safety: "UNCERTAIN",
                status: "PENDING",
              },
            })
          )
        );

        created[category] = list.length;
      } catch (error) {
        console.error(`Story Bible proposals error (${category}):`, error);

        failed.push({
          category,
          error:
            error instanceof Error
              ? error.message
              : "Не удалось создать предложения.",
        });
      }
    }

    const createdTotal = Object.values(created).reduce(
      (sum, value) => sum + (value ?? 0),
      0
    );

    return NextResponse.json({
      ok: failed.length === 0,
      created,
      createdTotal,
      skipped,
      notMapped,
      failed,
    });
  } catch (error) {
    console.error("Story Bible proposals error:", error);

    return NextResponse.json(
      { error: "Не удалось создать предложения." },
      { status: 500 }
    );
  }
}
