import { Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorActor,
  CanonAccessError,
  ProposalStateError,
} from "./actor";
import {
  ProposalAction,
  transitionProposal,
} from "./proposal-state";
import { proposalPayloadSchema } from "@/lib/schemas/proposal";

const prisma = new PrismaClient();

/**
 * Безопасно переводит JSON из Prisma
 * в формат, который Prisma принимает для записи.
 */
function toInputJson(
  value: unknown
):
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput
  | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Проверка структуры плана главы.
 */
function parseChapterPlan(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new ProposalStateError(
      "План главы имеет некорректный формат"
    );
  }

  const plan = value as Record<string, unknown>;

  const stringFields = [
    "chapterPurpose",
    "initialState",
    "endState",
  ];

  for (const field of stringFields) {
    if (
      plan[field] !== undefined &&
      plan[field] !== null &&
      typeof plan[field] !== "string"
    ) {
      throw new ProposalStateError(
        `Поле ${field} плана главы должно быть текстом`
      );
    }
  }

  const arrayFields = [
    "plotDevelopment",
    "characterDevelopment",
    "mustHappen",
    "mustNotHappen",
    "openQuestions",
  ];

  for (const field of arrayFields) {
    if (
      plan[field] !== undefined &&
      plan[field] !== null &&
      !Array.isArray(plan[field])
    ) {
      throw new ProposalStateError(
        `Поле ${field} плана главы должно быть массивом`
      );
    }

    if (Array.isArray(plan[field])) {
      for (const item of plan[field]) {
        if (typeof item !== "string") {
          throw new ProposalStateError(
            `Все элементы ${field} должны быть текстом`
          );
        }
      }
    }
  }

  return plan;
}

/**
 * Проверка структуры плана сцен.
 *
 * Ожидаемый формат:
 *
 * {
 *   chapterId: "...",
 *   scenes: [
 *     {
 *       order: 1,
 *       title: "...",
 *       purpose: "...",
 *       plan: ["...", "..."],
 *       plannedOutcome: "..."
 *     }
 *   ]
 * }
 */
function parseScenePlan(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new ProposalStateError(
      "План сцен имеет некорректный формат"
    );
  }

  const payload = value as Record<string, unknown>;

  const chapterId = payload.chapterId;

  if (
    chapterId !== undefined &&
    chapterId !== null &&
    typeof chapterId !== "string"
  ) {
    throw new ProposalStateError(
      "chapterId плана сцен должен быть строкой"
    );
  }

  if (!Array.isArray(payload.scenes)) {
    throw new ProposalStateError(
      "План сцен должен содержать массив scenes"
    );
  }

  const scenes = payload.scenes.map((scene, index) => {
    if (!scene || typeof scene !== "object") {
      throw new ProposalStateError(
        `Сцена ${index + 1} имеет некорректный формат`
      );
    }

    const item = scene as Record<string, unknown>;

    if (
      typeof item.order !== "number" ||
      !Number.isFinite(item.order)
    ) {
      throw new ProposalStateError(
        `У сцены ${index + 1} отсутствует корректный order`
      );
    }

    if (typeof item.title !== "string" || !item.title.trim()) {
      throw new ProposalStateError(
        `У сцены ${index + 1} отсутствует title`
      );
    }

    if (
      item.purpose !== undefined &&
      item.purpose !== null &&
      typeof item.purpose !== "string"
    ) {
      throw new ProposalStateError(
        `purpose сцены ${index + 1} должен быть текстом`
      );
    }

    if (
      item.plan !== undefined &&
      item.plan !== null &&
      !Array.isArray(item.plan)
    ) {
      throw new ProposalStateError(
        `plan сцены ${index + 1} должен быть массивом`
      );
    }

    if (Array.isArray(item.plan)) {
      for (const step of item.plan) {
        if (typeof step !== "string") {
          throw new ProposalStateError(
            `Все пункты plan сцены ${index + 1} должны быть текстом`
          );
        }
      }
    }

    if (
      item.plannedOutcome !== undefined &&
      item.plannedOutcome !== null &&
      typeof item.plannedOutcome !== "string"
    ) {
      throw new ProposalStateError(
        `plannedOutcome сцены ${index + 1} должен быть текстом`
      );
    }

    return {
      order: item.order,
      title: item.title.trim(),
      purpose:
        typeof item.purpose === "string"
          ? item.purpose
          : null,
      plan: Array.isArray(item.plan)
        ? item.plan.filter(
            (step): step is string =>
              typeof step === "string"
          )
        : [],
      plannedOutcome:
        typeof item.plannedOutcome === "string"
          ? item.plannedOutcome
          : null,
    };
  });

  const orders = scenes.map((scene) => scene.order);

  if (new Set(orders).size !== orders.length) {
    throw new ProposalStateError(
      "У сцен не должно быть одинаковых order"
    );
  }

  return {
    chapterId:
      typeof chapterId === "string"
        ? chapterId
        : undefined,
    scenes,
  };
}

/**
 * Проверка Memory Update.
 */
function parseMemoryUpdate(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new ProposalStateError(
      "Memory Update имеет некорректный формат"
    );
  }

  const payload = value as Record<string, unknown>;

  if (
    typeof payload.chapterId !== "string" ||
    !payload.chapterId
  ) {
    throw new ProposalStateError(
      "Memory Update не содержит chapterId"
    );
  }

  if (
    typeof payload.shortSummary !== "string"
  ) {
    throw new ProposalStateError(
      "Memory Update не содержит shortSummary"
    );
  }

  if (
    typeof payload.fullSummary !== "string"
  ) {
    throw new ProposalStateError(
      "Memory Update не содержит fullSummary"
    );
  }

  const worldDelta =
    payload.worldDelta &&
    typeof payload.worldDelta === "object"
      ? (payload.worldDelta as Record<string, unknown>)
      : {};

  if (
    worldDelta.changes !== undefined &&
    !Array.isArray(worldDelta.changes)
  ) {
    throw new ProposalStateError(
      "worldDelta.changes должен быть массивом"
    );
  }

  const updates = payload.updates;

  if (!Array.isArray(updates)) {
    throw new ProposalStateError(
      "Memory Update должен содержать массив updates"
    );
  }

  const allowedTypes = new Set([
    "FACT",
    "CHARACTER_CHANGE",
    "RELATIONSHIP_CHANGE",
    "WORLD_CHANGE",
    "EVENT",
    "PLOT_PROGRESS",
    "SECRET",
    "FORESHADOWING",
    "QUESTION",
    "NEW_ENTITY",
  ]);

  const allowedSafety = new Set([
    "SAFE",
    "UNCERTAIN",
    "CONFLICT",
  ]);

  for (const update of updates) {
    if (!update || typeof update !== "object") {
      throw new ProposalStateError(
        "Некорректный элемент Memory Update"
      );
    }

    const item = update as Record<string, unknown>;

    if (
      typeof item.type !== "string" ||
      !allowedTypes.has(item.type)
    ) {
      throw new ProposalStateError(
        "Некорректный type Memory Update"
      );
    }

    if (
      typeof item.title !== "string" ||
      typeof item.content !== "string"
    ) {
      throw new ProposalStateError(
        "Memory Update должен содержать title и content"
      );
    }

    if (
      typeof item.safety !== "string" ||
      !allowedSafety.has(item.safety)
    ) {
      throw new ProposalStateError(
        "Некорректный safety Memory Update"
      );
    }

    if (
      typeof item.confidence !== "number" ||
      !Number.isFinite(item.confidence)
    ) {
      throw new ProposalStateError(
        "Некорректный confidence Memory Update"
      );
    }

    if (typeof item.reason !== "string") {
      throw new ProposalStateError(
        "Memory Update должен содержать reason"
      );
    }
  }

  return {
    chapterId: payload.chapterId,
    shortSummary: payload.shortSummary,
    fullSummary: payload.fullSummary,
    worldDelta: {
      changes: Array.isArray(worldDelta.changes)
        ? worldDelta.changes.filter(
            (item): item is string =>
              typeof item === "string"
          )
        : [],
    },
    updates,
  };
}

/**
 * Применение Proposal.
 *
 * ВАЖНО:
 * AI напрямую Canon не изменяет.
 * Любое изменение проходит через AUTHOR.
 */
export async function applyProposal(
  proposalId: string,
  action: ProposalAction,
  actor: AuthorActor,
  editedPayload?: unknown
) {
  if (actor.type !== "AUTHOR" || !actor.userId) {
    throw new CanonAccessError(
      "Изменение канона разрешено только аутентифицированному автору"
    );
  }

  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findUnique({
      where: {
        id: proposalId,
      },
      include: {
        project: true,
      },
    });

    if (!proposal) {
      throw new ProposalStateError(
        "Proposal не найден"
      );
    }

    if (
      proposal.project.userId !== actor.userId
    ) {
      throw new CanonAccessError(
        "Автор не имеет доступа к этому проекту"
      );
    }

    const currentStatus =
      proposal.status as
        | "PENDING"
        | "ACCEPTED"
        | "REJECTED"
        | "SUPERSEDED";

    const transition =
      transitionProposal({
        current: currentStatus,
        action,
        actorType: "AUTHOR",
      });

    let payload: unknown = proposal.payload;

    if (action === "EDIT_AND_ACCEPT") {
      if (editedPayload === undefined) {
        throw new ProposalStateError(
          "Для EDIT_AND_ACCEPT необходимо передать editedPayload"
        );
      }

      payload = editedPayload;
    }

    /**
     * REJECT
     */
    if (!transition.mutatesCanon) {
      const updatedProposal =
        await tx.proposal.update({
          where: {
            id: proposal.id,
          },
          data: {
            status: transition.next,
            reviewedAt: new Date(),
            reviewedById: actor.userId,
          },
        });

      return {
        proposal: updatedProposal,
        canonEntityId: proposal.entityId,
        canonChanged: false,
      };
    }

    /**
     * =========================================================
     * CHAPTER PLAN
     * =========================================================
     */
    if (
      proposal.entityType ===
      "chapter_plan"
    ) {
      if (
        proposal.op !== "UPDATE" &&
        proposal.op !== "CREATE"
      ) {
        throw new ProposalStateError(
          `Операция ${proposal.op} не поддерживается для плана главы`
        );
      }

      if (!proposal.sourceChapterId) {
        throw new ProposalStateError(
          "У Proposal плана главы отсутствует sourceChapterId"
        );
      }

      const chapter =
        await tx.chapter.findFirst({
          where: {
            id: proposal.sourceChapterId,
            book: {
              projectId:
                proposal.projectId,
            },
          },
        });

      if (!chapter) {
        throw new ProposalStateError(
          "Глава, для которой создан план, не найдена"
        );
      }

      const parsedPlan =
        parseChapterPlan(payload);

      const updatedChapter =
        await tx.chapter.update({
          where: {
            id: chapter.id,
          },
          data: {
            plan: toInputJson(
              parsedPlan
            ),
            planApproved: true,
            status: "PLANNED",
          },
        });

      const updatedProposal =
        await tx.proposal.update({
          where: {
            id: proposal.id,
          },
          data: {
            status: transition.next,
            entityId:
              updatedChapter.id,
            editedPayload:
              action ===
              "EDIT_AND_ACCEPT"
                ? toInputJson(
                    parsedPlan
                  )
                : undefined,
            reviewedAt: new Date(),
            reviewedById:
              actor.userId,
          },
        });

      await tx.changeLog.create({
        data: {
          projectId:
            proposal.projectId,
          entityType:
            "chapter_plan",
          entityId:
            updatedChapter.id,
          op: "UPDATE",
          before: toInputJson(
            chapter.plan
          ),
          after: toInputJson(
            parsedPlan
          ),
          actorType: "AUTHOR",
          actorId: actor.userId,
          proposalId:
            proposal.id,
          aiRunId:
            proposal.aiRunId,
          chapterId:
            updatedChapter.id,
        },
      });

      return {
        proposal:
          updatedProposal,
        canonEntityId:
          updatedChapter.id,
        canonChanged: true,
      };
    }

    /**
     * =========================================================
     * SCENE PLAN
     * =========================================================
     *
     * Scene Planner создаёт Proposal.
     *
     * После ACCEPT:
     *
     * Proposal -> ACCEPTED
     * ↓
     * старые сцены главы удаляются
     * ↓
     * новые сцены записываются
     *
     * Глава остаётся PLANNED.
     * =========================================================
     */
    if (
      proposal.entityType ===
      "scene_plan"
    ) {
      if (
        proposal.op !== "CREATE" &&
        proposal.op !== "UPDATE"
      ) {
        throw new ProposalStateError(
          `Операция ${proposal.op} не поддерживается для плана сцен`
        );
      }

      if (!proposal.sourceChapterId) {
        throw new ProposalStateError(
          "У Proposal плана сцен отсутствует sourceChapterId"
        );
      }

      const chapter =
        await tx.chapter.findFirst({
          where: {
            id: proposal.sourceChapterId,
            book: {
              projectId:
                proposal.projectId,
            },
          },
        });

      if (!chapter) {
        throw new ProposalStateError(
          "Глава, для которой создан план сцен, не найдена"
        );
      }

      const parsedScenePlan =
        parseScenePlan(payload);

      if (
        parsedScenePlan.chapterId &&
        parsedScenePlan.chapterId !==
          chapter.id
      ) {
        throw new ProposalStateError(
          "chapterId плана сцен не совпадает с главой Proposal"
        );
      }

      /**
       * Сначала удаляем предыдущий
       * план сцен.
       *
       * Это позволяет повторно
       * запускать Scene Planner.
       */
      await tx.scene.deleteMany({
        where: {
          chapterId: chapter.id,
        },
      });

      /**
       * Создаём новые сцены.
       */
      for (
        const scene of
          parsedScenePlan.scenes
      ) {
        await tx.scene.create({
          data: {
            chapterId:
              chapter.id,
            order:
              scene.order,
            title:
              scene.title,
            purpose:
              scene.purpose,
            plan: toInputJson(
              scene.plan
            ),
            plannedOutcome:
              scene.plannedOutcome,
            status: "DRAFT",
          },
        });
      }

      /**
       * Глава остаётся
       * запланированной.
       */
      const updatedChapter =
        await tx.chapter.update({
          where: {
            id: chapter.id,
          },
          data: {
            status: "PLANNED",
          },
        });

      const updatedProposal =
        await tx.proposal.update({
          where: {
            id: proposal.id,
          },
          data: {
            status:
              transition.next,
            entityId:
              updatedChapter.id,
            editedPayload:
              action ===
              "EDIT_AND_ACCEPT"
                ? toInputJson(
                    parsedScenePlan
                  )
                : undefined,
            reviewedAt: new Date(),
            reviewedById:
              actor.userId,
          },
        });

      await tx.changeLog.create({
        data: {
          projectId:
            proposal.projectId,
          entityType:
            "scene_plan",
          entityId:
            updatedChapter.id,
          op: proposal.op,
          before:
            Prisma.JsonNull,
          after: toInputJson(
            parsedScenePlan
          ),
          actorType: "AUTHOR",
          actorId: actor.userId,
          proposalId:
            proposal.id,
          aiRunId:
            proposal.aiRunId,
          chapterId:
            updatedChapter.id,
        },
      });

      return {
        proposal:
          updatedProposal,
        canonEntityId:
          updatedChapter.id,
        canonChanged: true,
      };
    }

    /**
     * =========================================================
     * MEMORY UPDATE
     * =========================================================
     *
     * Memory появляется только после
     * утверждения главы как CANON.
     *
     * AI не пишет Memory напрямую.
     * Сначала создаётся Proposal,
     * затем AUTHOR принимает его.
     */
    if (
      proposal.entityType ===
      "memory_update"
    ) {
      if (proposal.op !== "CREATE") {
        throw new ProposalStateError(
          `Операция ${proposal.op} не поддерживается для Memory Update`
        );
      }

      if (!proposal.sourceChapterId) {
        throw new ProposalStateError(
          "У Memory Update отсутствует sourceChapterId"
        );
      }

      const parsedMemory =
        parseMemoryUpdate(payload);

      if (
        parsedMemory.chapterId !==
        proposal.sourceChapterId
      ) {
        throw new ProposalStateError(
          "chapterId Memory Update не совпадает с sourceChapterId"
        );
      }

      const chapter =
        await tx.chapter.findFirst({
          where: {
            id: proposal.sourceChapterId,
            book: {
              projectId:
                proposal.projectId,
            },
          },
        });

      if (!chapter) {
        throw new ProposalStateError(
          "Глава Memory Update не найдена"
        );
      }

      if (chapter.status !== "CANON") {
        throw new ProposalStateError(
          "Memory Update можно принять только для главы со статусом CANON"
        );
      }

      /**
       * Сохраняем Rolling Summary.
       */
      const chapterSummary =
        await tx.chapterSummary.upsert({
          where: {
            chapterId:
              chapter.id,
          },
          create: {
            chapterId:
              chapter.id,
            shortSummary:
              parsedMemory.shortSummary,
            fullSummary:
              parsedMemory.fullSummary,
            worldDelta:
              toInputJson(
                parsedMemory.worldDelta
              ),
            aiRunId:
              proposal.aiRunId,
          },
          update: {
            shortSummary:
              parsedMemory.shortSummary,
            fullSummary:
              parsedMemory.fullSummary,
            worldDelta:
              toInputJson(
                parsedMemory.worldDelta
              ),
            aiRunId:
              proposal.aiRunId,
          },
        });

      /**
       * Краткое summary также записываем
       * непосредственно в Chapter.
       */
      await tx.chapter.update({
        where: {
          id: chapter.id,
        },
        data: {
          summary:
            parsedMemory.shortSummary,
        },
      });

      /**
       * Retrieval Memory.
       *
       * Embedding пока специально
       * не создаём.
       */
      const memoryContent = [
        `Глава ${chapter.number}`,
        "",
        "КРАТКОЕ РЕЗЮМЕ:",
        parsedMemory.shortSummary,
        "",
        "ПОЛНОЕ РЕЗЮМЕ:",
        parsedMemory.fullSummary,
        "",
        "ИЗМЕНЕНИЯ МИРА:",
        ...parsedMemory.worldDelta
          .changes.map(
            (item) => `- ${item}`
          ),
        "",
        "ОБНОВЛЕНИЯ:",
        ...parsedMemory.updates.map(
          (item) =>
            `- [${item.type}] ${item.title}: ${item.content} (${item.safety})`
        ),
      ].join("\n");

      const memoryChunk =
        await tx.memoryChunk.create({
          data: {
            projectId:
              proposal.projectId,
            chapterId:
              chapter.id,
            kind: "SUMMARY",
            content:
              memoryContent,
            tokenCount: null,
            metadata:
              toInputJson({
                source:
                  "MEMORY_UPDATE",
                proposalId:
                  proposal.id,
                aiRunId:
                  proposal.aiRunId,
                chapterNumber:
                  chapter.number,
                worldDelta:
                  parsedMemory.worldDelta,
                updates:
                  parsedMemory.updates,
                counts: {
                  total:
                    parsedMemory
                      .updates
                      .length,
                  safe:
                    parsedMemory
                      .updates
                      .filter(
                        (item) =>
                          item.safety ===
                          "SAFE"
                      ).length,
                  uncertain:
                    parsedMemory
                      .updates
                      .filter(
                        (item) =>
                          item.safety ===
                          "UNCERTAIN"
                      ).length,
                  conflicts:
                    parsedMemory
                      .updates
                      .filter(
                        (item) =>
                          item.safety ===
                          "CONFLICT"
                      ).length,
                },
              }),
          },
        });

      /**
       * Proposal ACCEPTED только
       * после успешной записи Memory.
       */
      const updatedProposal =
        await tx.proposal.update({
          where: {
            id: proposal.id,
          },
          data: {
            status:
              transition.next,
            entityId:
              chapter.id,
            editedPayload:
              action ===
              "EDIT_AND_ACCEPT"
                ? toInputJson(
                    parsedMemory
                  )
                : undefined,
            reviewedAt: new Date(),
            reviewedById:
              actor.userId,
          },
        });

      await tx.changeLog.create({
        data: {
          projectId:
            proposal.projectId,
          entityType:
            "memory_update",
          entityId:
            chapter.id,
          op: "CREATE",
          before:
            Prisma.JsonNull,
          after: toInputJson({
            chapterSummaryId:
              chapterSummary.id,
            memoryChunkId:
              memoryChunk.id,
            shortSummary:
              parsedMemory.shortSummary,
            fullSummary:
              parsedMemory.fullSummary,
            worldDelta:
              parsedMemory.worldDelta,
            updates:
              parsedMemory.updates,
          }),
          actorType: "AUTHOR",
          actorId: actor.userId,
          proposalId:
            proposal.id,
          aiRunId:
            proposal.aiRunId,
          chapterId:
            chapter.id,
        },
      });

      return {
        proposal:
          updatedProposal,
        canonEntityId:
          chapter.id,
        canonChanged: true,
        memoryUpdated: true,
        chapterSummaryId:
          chapterSummary.id,
        memoryChunkId:
          memoryChunk.id,
      };
    }

    /**
     * =========================================================
     * ОБЫЧНЫЕ CANON PROPOSALS
     * =========================================================
     */
    if (proposal.op !== "CREATE") {
      throw new ProposalStateError(
        `Операция ${proposal.op} пока не поддерживается шлюзом Canon`
      );
    }

    const parsed =
      proposalPayloadSchema.parse(
        payload
      );

    let canonEntityId =
      proposal.entityId ?? "";

    switch (
      parsed.entityType
    ) {
      case "CHARACTER": {
        const character =
          await tx.character.create({
            data: {
              projectId:
                proposal.projectId,
              name:
                parsed.data.name,
              role:
                parsed.data.role ??
                null,
              description:
                parsed.data
                  .description ??
                null,
              appearance:
                parsed.data
                  .appearance ??
                null,
              history:
                parsed.data
                  .history ??
                null,
              personality:
                parsed.data
                  .personality ??
                null,
              goals:
                parsed.data
                  .goals ??
                null,
              fears:
                parsed.data
                  .fears ??
                null,
              beliefs:
                parsed.data
                  .beliefs ??
                null,
              values:
                parsed.data
                  .values ??
                null,
              abilities:
                toInputJson(
                  parsed.data
                    .abilities
                ),
              status: "CANON",
              canonLevel: "SOFT",
              factSource:
                "AUTHOR",
              sourceProposalId:
                proposal.id,
            },
          });

        canonEntityId =
          character.id;

        break;
      }

      case "WORLD_ENTITY": {
        const worldEntity =
          await tx.worldEntity.create({
            data: {
              projectId:
                proposal.projectId,
              type:
                parsed.data.type as
                  | "LOCATION"
                  | "FACTION"
                  | "ORGANIZATION"
                  | "CIVILIZATION"
                  | "SPECIES"
                  | "SYSTEM"
                  | "TECHNOLOGY"
                  | "MAGIC"
                  | "ARTIFACT"
                  | "HISTORICAL_PERIOD"
                  | "CONCEPT"
                  | "EXTERNAL_FORCE",
              name:
                parsed.data.name,
              description:
                parsed.data
                  .description ??
                null,
              attributes:
                toInputJson(
                  parsed.data
                    .attributes
                ),
              status: "CANON",
              canonLevel: "SOFT",
              factSource:
                "AUTHOR",
              sourceProposalId:
                proposal.id,
            },
          });

        canonEntityId =
          worldEntity.id;

        break;
      }

      case "WORLD_RULE": {
        const worldRule =
          await tx.worldRule.create({
            data: {
              projectId:
                proposal.projectId,
              name:
                parsed.data.name,
              statement:
                parsed.data
                  .statement,
              explanation:
                parsed.data
                  .explanation ??
                null,
              canonLevel:
                "HARD",
              status: "CANON",
            },
          });

        canonEntityId =
          worldRule.id;

        break;
      }

      case "PLOT_LINE": {
        const plotLine =
          await tx.plotLine.create({
            data: {
              projectId:
                proposal.projectId,
              name:
                parsed.data.name,
              premise:
                parsed.data
                  .description ??
                null,
              plotStatus:
                "ACTIVE",
              status: "CANON",
            },
          });

        canonEntityId =
          plotLine.id;

        break;
      }

      case "EVENT": {
        const event =
          await tx.event.create({
            data: {
              projectId:
                proposal.projectId,
              name:
                parsed.data.name,
              description:
                parsed.data
                  .description ??
                null,
              inWorldDate:
                parsed.data
                  .inWorldDate ??
                null,
              cause:
                parsed.data
                  .cause ??
                null,
              consequences:
                parsed.data
                  .consequences ??
                null,
              status: "CANON",
              canonLevel:
                "SOFT",
            },
          });

        canonEntityId =
          event.id;

        break;
      }
    }

    /**
     * Proposal становится ACCEPTED
     * только после успешной записи.
     */
    const updatedProposal =
      await tx.proposal.update({
        where: {
          id: proposal.id,
        },
        data: {
          status:
            transition.next,
          entityId:
            canonEntityId,
          editedPayload:
            action ===
            "EDIT_AND_ACCEPT"
              ? toInputJson(
                  payload
                )
              : undefined,
          reviewedAt: new Date(),
          reviewedById:
            actor.userId,
        },
      });

    /**
     * ChangeLog.
     */
    await tx.changeLog.create({
      data: {
        projectId:
          proposal.projectId,
        entityType:
          proposal.entityType,
        entityId:
          canonEntityId,
        op: proposal.op,
        before:
          Prisma.JsonNull,
        after:
          toInputJson(payload),
        actorType:
          "AUTHOR",
        actorId:
          actor.userId,
        proposalId:
          proposal.id,
        aiRunId:
          proposal.aiRunId,
        chapterId:
          proposal.sourceChapterId,
      },
    });

    return {
      proposal:
        updatedProposal,
      canonEntityId,
      canonChanged: true,
    };
  });
}