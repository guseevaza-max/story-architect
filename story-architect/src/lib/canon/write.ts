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

 *

 * Используется для OPTIONAL Json-полей.

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



  return JSON.parse(

    JSON.stringify(value)

  ) as Prisma.InputJsonValue;

}



/**

 * Переводит значение в ОБЯЗАТЕЛЬНЫЙ

 * Prisma InputJsonValue.

 *

 * Используется там, где Prisma Schema

 * требует Json, а не Json?.

 */

function toRequiredInputJson(

  value: unknown

): Prisma.InputJsonValue {

  if (value === undefined) {

    throw new ProposalStateError(

      "Обязательное JSON-поле не может быть undefined"

    );

  }



  if (value === null) {

    return Prisma.JsonNull as unknown as Prisma.InputJsonValue;

  }



  return JSON.parse(

    JSON.stringify(value)

  ) as Prisma.InputJsonValue;

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



  const plan =

    value as Record<string, unknown>;



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

 */

function parseScenePlan(value: unknown) {

  if (!value || typeof value !== "object") {

    throw new ProposalStateError(

      "План сцен имеет некорректный формат"

    );

  }



  const payload =

    value as Record<string, unknown>;



  const chapterId =

    payload.chapterId;



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



  const scenes =

    payload.scenes.map(

      (scene, index) => {

        if (

          !scene ||

          typeof scene !== "object"

        ) {

          throw new ProposalStateError(

            `Сцена ${index + 1} имеет некорректный формат`

          );

        }



        const item =

          scene as Record<

            string,

            unknown

          >;



        if (

          typeof item.order !== "number" ||

          !Number.isFinite(item.order)

        ) {

          throw new ProposalStateError(

            `У сцены ${index + 1} отсутствует корректный order`

          );

        }



        if (

          typeof item.title !== "string" ||

          !item.title.trim()

        ) {

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

          for (

            const step of item.plan

          ) {

            if (

              typeof step !== "string"

            ) {

              throw new ProposalStateError(

                `Все пункты plan сцены ${index + 1} должны быть текстом`

              );

            }

          }

        }



        if (

          item.plannedOutcome !==

            undefined &&

          item.plannedOutcome !==

            null &&

          typeof item.plannedOutcome !==

            "string"

        ) {

          throw new ProposalStateError(

            `plannedOutcome сцены ${index + 1} должен быть текстом`

          );

        }



        return {

          order:

            item.order,



          title:

            item.title.trim(),



          purpose:

            typeof item.purpose ===

            "string"

              ? item.purpose

              : null,



          plan:

            Array.isArray(

              item.plan

            )

              ? item.plan.filter(

                  (

                    step

                  ): step is string =>

                    typeof step ===

                    "string"

                )

              : [],



          plannedOutcome:

            typeof item.plannedOutcome ===

            "string"

              ? item.plannedOutcome

              : null,

        };

      }

    );



  const orders =

    scenes.map(

      (scene) =>

        scene.order

    );



  if (

    new Set(orders).size !==

    orders.length

  ) {

    throw new ProposalStateError(

      "У сцен не должно быть одинаковых order"

    );

  }



  return {

    chapterId:

      typeof chapterId ===

      "string"

        ? chapterId

        : undefined,



    scenes,

  };

}



/**

 * Проверка Memory Update.

 *

 * Дополнительно поддерживает:

 *

 * characterChanges

 * characterProposals

 */

function parseMemoryUpdate(

  value: unknown

) {

  if (

    !value ||

    typeof value !== "object"

  ) {

    throw new ProposalStateError(

      "Memory Update имеет некорректный формат"

    );

  }



  const payload =

    value as Record<

      string,

      unknown

    >;



  if (

    typeof payload.chapterId !==

      "string" ||

    !payload.chapterId

  ) {

    throw new ProposalStateError(

      "Memory Update не содержит chapterId"

    );

  }



  if (

    typeof payload.shortSummary !==

      "string"

  ) {

    throw new ProposalStateError(

      "Memory Update не содержит shortSummary"

    );

  }



  if (

    typeof payload.fullSummary !==

      "string"

  ) {

    throw new ProposalStateError(

      "Memory Update не содержит fullSummary"

    );

  }



  const worldDelta =

    payload.worldDelta &&

    typeof payload.worldDelta ===

      "object"

      ? (payload.worldDelta as Record<

          string,

          unknown

        >)

      : {};



  if (

    worldDelta.changes !==

      undefined &&

    !Array.isArray(

      worldDelta.changes

    )

  ) {

    throw new ProposalStateError(

      "worldDelta.changes должен быть массивом"

    );

  }



  const updates =

    payload.updates;



  if (

    !Array.isArray(updates)

  ) {

    throw new ProposalStateError(

      "Memory Update должен содержать массив updates"

    );

  }



  const allowedTypes =

    new Set([

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



  const allowedSafety =

    new Set([

      "SAFE",

      "UNCERTAIN",

      "CONFLICT",

    ]);



  const characterChanges: Array<{

    characterName: string;

    attribute: string;

    oldValue: string | null;

    newValue: string;

    reason: string;

    confidence: number;

    safety:

      | "SAFE"

      | "UNCERTAIN"

      | "CONFLICT";

  }> = [];



  const relationshipChanges: Array<{

    sourceCharacterName: string;

    targetCharacterName: string;

    relationType: string;

    oldValue: string | null;

    newValue: string;

    reason: string;

    confidence: number;

    safety:

      | "SAFE"

      | "UNCERTAIN"

      | "CONFLICT";

  }> = [];



  for (

    const update of updates

  ) {

    if (

      !update ||

      typeof update !== "object"

    ) {

      throw new ProposalStateError(

        "Некорректный элемент Memory Update"

      );

    }



    const item =

      update as Record<

        string,

        unknown

      >;



    if (

      typeof item.type !==

        "string" ||

      !allowedTypes.has(

        item.type

      )

    ) {

      throw new ProposalStateError(

        "Некорректный type Memory Update"

      );

    }



    if (

      typeof item.title !==

        "string" ||

      typeof item.content !==

        "string"

    ) {

      throw new ProposalStateError(

        "Memory Update должен содержать title и content"

      );

    }



    if (

      typeof item.safety !==

        "string" ||

      !allowedSafety.has(

        item.safety

      )

    ) {

      throw new ProposalStateError(

        "Некорректный safety Memory Update"

      );

    }



    if (

      typeof item.confidence !==

        "number" ||

      !Number.isFinite(

        item.confidence

      )

    ) {

      throw new ProposalStateError(

        "Некорректный confidence Memory Update"

      );

    }



    if (

      typeof item.reason !==

        "string"

    ) {

      throw new ProposalStateError(

        "Memory Update должен содержать reason"

      );

    }



    /**

     * CHARACTER_CHANGE.

     */

    if (

      item.type ===

      "CHARACTER_CHANGE"

    ) {

      const characterName =

        typeof item.characterName ===

        "string"

          ? item.characterName.trim()

          : "";



      const attribute =

        typeof item.attribute ===

        "string"

          ? item.attribute.trim()

          : "";



      const newValue =

        typeof item.newValue ===

        "string"

          ? item.newValue.trim()

          : "";



      const oldValue =

        typeof item.oldValue ===

        "string"

          ? item.oldValue.trim()

          : null;



      if (

        characterName &&

        attribute &&

        newValue

      ) {

        characterChanges.push({

          characterName,

          attribute,

          oldValue:

            oldValue || null,

          newValue,

          reason:

            item.reason,

          confidence:

            item.confidence,

          safety:

            item.safety as

              | "SAFE"

              | "UNCERTAIN"

              | "CONFLICT",

        });

      }

    }



    /**

     * RELATIONSHIP_CHANGE.

     */

    if (

      item.type ===

      "RELATIONSHIP_CHANGE"

    ) {

      const sourceCharacterName =

        typeof item.sourceCharacterName ===

        "string"

          ? item.sourceCharacterName.trim()

          : "";



      const targetCharacterName =

        typeof item.targetCharacterName ===

        "string"

          ? item.targetCharacterName.trim()

          : "";



      const relationType =

        typeof item.relationType ===

        "string"

          ? item.relationType.trim().toLowerCase()

          : "";



      const newValue =

        typeof item.newValue ===

        "string"

          ? item.newValue.trim()

          : "";



      const oldValue =

        typeof item.oldValue ===

        "string"

          ? item.oldValue.trim()

          : null;



      if (

        sourceCharacterName &&

        targetCharacterName &&

        relationType &&

        newValue

      ) {

        relationshipChanges.push({

          sourceCharacterName,

          targetCharacterName,

          relationType,

          oldValue:

            oldValue || null,

          newValue,

          reason:

            item.reason,

          confidence:

            item.confidence,

          safety:

            item.safety as

              | "SAFE"

              | "UNCERTAIN"

              | "CONFLICT",

        });

      }

    }

  }



  /**

   * Новые персонажи.

   */

  const characterProposals =

    Array.isArray(

      payload.characterProposals

    )

      ? payload.characterProposals

          .filter(

            (

              item

            ): item is Record<

              string,

              unknown

            > =>

              !!item &&

              typeof item ===

                "object" &&

              typeof (

                item as Record<

                  string,

                  unknown

                >

              ).name ===

                "string"

          )

          .map(

            (item) => {

              const safety =

                item.safety ===

                  "SAFE" ||

                item.safety ===

                  "CONFLICT" ||

                item.safety ===

                  "UNCERTAIN"

                  ? item.safety

                  : "UNCERTAIN";



              const confidence =

                typeof item.confidence ===

                  "number" &&

                Number.isFinite(

                  item.confidence

                )

                  ? item.confidence

                  : null;



              return {

                name:

                  String(

                    item.name

                  ).trim(),



                role:

                  typeof item.role ===

                  "string"

                    ? item.role

                    : null,



                description:

                  typeof item.description ===

                  "string"

                    ? item.description

                    : null,



                appearance:

                  typeof item.appearance ===

                  "string"

                    ? item.appearance

                    : null,



                history:

                  typeof item.history ===

                  "string"

                    ? item.history

                    : null,



                personality:

                  typeof item.personality ===

                  "string"

                    ? item.personality

                    : null,



                goals:

                  typeof item.goals ===

                  "string"

                    ? item.goals

                    : null,



                fears:

                  typeof item.fears ===

                  "string"

                    ? item.fears

                    : null,



                beliefs:

                  typeof item.beliefs ===

                  "string"

                    ? item.beliefs

                    : null,



                values:

                  typeof item.values ===

                  "string"

                    ? item.values

                    : null,



                abilities:

                  item.abilities !==

                  undefined

                    ? item.abilities

                    : null,



                safety,



                confidence,



                reason:

                  typeof item.reason ===

                  "string"

                    ? item.reason

                    : "Персонаж обнаружен AI при обработке Memory Update",

              };

            }

          )

          .filter(

            (item) =>

              item.name.length >

              0

          )

      : [];



  return {

    chapterId:

      payload.chapterId,



    shortSummary:

      payload.shortSummary,



    fullSummary:

      payload.fullSummary,



    worldDelta: {

      changes:

        Array.isArray(

          worldDelta.changes

        )

          ? worldDelta.changes.filter(

              (

                item

              ): item is string =>

                typeof item ===

                "string"

            )

          : [],

    },



    updates,



    characterChanges,



    relationshipChanges,



    characterProposals,

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

  if (

    actor.type !==

      "AUTHOR" ||

    !actor.userId

  ) {

    throw new CanonAccessError(

      "Изменение канона разрешено только аутентифицированному автору"

    );

  }



  return prisma.$transaction(

    async (tx) => {

      const proposal =

        await tx.proposal.findUnique(

          {

            where: {

              id: proposalId,

            },



            include: {

              project: true,

            },

          }

        );



      if (!proposal) {

        throw new ProposalStateError(

          "Proposal не найден"

        );

      }



      if (

        proposal.project.userId !==

        actor.userId

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

          current:

            currentStatus,



          action,



          actorType:

            "AUTHOR",

        });



      let payload:

        unknown =

        proposal.payload;



      if (

        action ===

        "EDIT_AND_ACCEPT"

      ) {

        if (

          editedPayload ===

          undefined

        ) {

          throw new ProposalStateError(

            "Для EDIT_AND_ACCEPT необходимо передать editedPayload"

          );

        }



        payload =

          editedPayload;

      }



      /**

       * REJECT

       */

      if (

        !transition.mutatesCanon

      ) {

        const updatedProposal =

          await tx.proposal.update(

            {

              where: {

                id:

                  proposal.id,

              },



              data: {

                status:

                  transition.next,



                reviewedAt:

                  new Date(),



                reviewedById:

                  actor.userId,

              },

            }

          );



        return {

          proposal:

            updatedProposal,



          canonEntityId:

            proposal.entityId,



          canonChanged:

            false,

        };

      }



      /**

       * =====================================================

       * CHAPTER PLAN

       * =====================================================

       */

      if (

        proposal.entityType ===

        "chapter_plan"

      ) {

        if (

          proposal.op !==

            "UPDATE" &&

          proposal.op !==

            "CREATE"

        ) {

          throw new ProposalStateError(

            `Операция ${proposal.op} не поддерживается для плана главы`

          );

        }



        if (

          !proposal.sourceChapterId

        ) {

          throw new ProposalStateError(

            "У Proposal плана главы отсутствует sourceChapterId"

          );

        }



        const chapter =

          await tx.chapter.findFirst(

            {

              where: {

                id:

                  proposal.sourceChapterId,



                book: {

                  projectId:

                    proposal.projectId,

                },

              },

            }

          );



        if (!chapter) {

          throw new ProposalStateError(

            "Глава, для которой создан план, не найдена"

          );

        }



        const parsedPlan =

          parseChapterPlan(

            payload

          );



        const updatedChapter =

          await tx.chapter.update(

            {

              where: {

                id:

                  chapter.id,

              },



              data: {

                plan:

                  toInputJson(

                    parsedPlan

                  ),



                planApproved:

                  true,



                status:

                  "PLANNED",

              },

            }

          );



        const updatedProposal =

          await tx.proposal.update(

            {

              where: {

                id:

                  proposal.id,

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

                        parsedPlan

                      )

                    : undefined,



                reviewedAt:

                  new Date(),



                reviewedById:

                  actor.userId,

              },

            }

          );



        await tx.changeLog.create(

          {

            data: {

              projectId:

                proposal.projectId,



              entityType:

                "chapter_plan",



              entityId:

                updatedChapter.id,



              op:

                "UPDATE",



              before:

                toInputJson(

                  chapter.plan

                ),



              after:

                toInputJson(

                  parsedPlan

                ),



              actorType:

                "AUTHOR",



              actorId:

                actor.userId,



              proposalId:

                proposal.id,



              aiRunId:

                proposal.aiRunId,



              chapterId:

                updatedChapter.id,

            },

          }

        );



        return {

          proposal:

            updatedProposal,



          canonEntityId:

            updatedChapter.id,



          canonChanged:

            true,

        };

      }



      /**

       * =====================================================

       * SCENE PLAN

       * =====================================================

       */

      if (

        proposal.entityType ===

        "scene_plan"

      ) {

        if (

          proposal.op !==

            "CREATE" &&

          proposal.op !==

            "UPDATE"

        ) {

          throw new ProposalStateError(

            `Операция ${proposal.op} не поддерживается для плана сцен`

          );

        }



        if (

          !proposal.sourceChapterId

        ) {

          throw new ProposalStateError(

            "У Proposal плана сцен отсутствует sourceChapterId"

          );

        }



        const chapter =

          await tx.chapter.findFirst(

            {

              where: {

                id:

                  proposal.sourceChapterId,



                book: {

                  projectId:

                    proposal.projectId,

                },

              },

            }

          );



        if (!chapter) {

          throw new ProposalStateError(

            "Глава, для которой создан план сцен, не найдена"

          );

        }



        const parsedScenePlan =

          parseScenePlan(

            payload

          );



        if (

          parsedScenePlan.chapterId &&

          parsedScenePlan.chapterId !==

            chapter.id

        ) {

          throw new ProposalStateError(

            "chapterId плана сцен не совпадает с главой Proposal"

          );

        }



        await tx.scene.deleteMany(

          {

            where: {

              chapterId:

                chapter.id,

            },

          }

        );



        for (

          const scene of

            parsedScenePlan.scenes

        ) {

          await tx.scene.create(

            {

              data: {

                chapterId:

                  chapter.id,



                order:

                  scene.order,



                title:

                  scene.title,



                purpose:

                  scene.purpose,



                plan:

                  toInputJson(

                    scene.plan

                  ),



                plannedOutcome:

                  scene.plannedOutcome,



                status:

                  "DRAFT",

              },

            }

          );

        }



        const updatedChapter =

          await tx.chapter.update(

            {

              where: {

                id:

                  chapter.id,

              },



              data: {

                status:

                  "PLANNED",

              },

            }

          );



        const updatedProposal =

          await tx.proposal.update(

            {

              where: {

                id:

                  proposal.id,

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



                reviewedAt:

                  new Date(),



                reviewedById:

                  actor.userId,

              },

            }

          );



        await tx.changeLog.create(

          {

            data: {

              projectId:

                proposal.projectId,



              entityType:

                "scene_plan",



              entityId:

                updatedChapter.id,



              op:

                proposal.op,



              before:

                Prisma.JsonNull,



              after:

                toInputJson(

                  parsedScenePlan

                ),



              actorType:

                "AUTHOR",



              actorId:

                actor.userId,



              proposalId:

                proposal.id,



              aiRunId:

                proposal.aiRunId,



              chapterId:

                updatedChapter.id,

            },

          }

        );



        return {

          proposal:

            updatedProposal,



          canonEntityId:

            updatedChapter.id,



          canonChanged:

            true,

        };

      }



      /**

       * =====================================================

       * MEMORY UPDATE

       * =====================================================

       */

      if (

        proposal.entityType ===

        "memory_update"

      ) {

        if (

          proposal.op !==

          "CREATE"

        ) {

          throw new ProposalStateError(

            `Операция ${proposal.op} не поддерживается для Memory Update`

          );

        }



        if (

          !proposal.sourceChapterId

        ) {

          throw new ProposalStateError(

            "У Memory Update отсутствует sourceChapterId"

          );

        }



        /**

         * sourceChapterId является

         * авторитетным chapterId.

         *

         * Это также исправляет

         * прежнюю ошибку:

         * "Memory Update не содержит chapterId".

         */

        const memoryPayload =

          payload &&

          typeof payload ===

            "object"

            ? {

                ...(payload as Record<

                  string,

                  unknown

                >),



                chapterId:

                  proposal.sourceChapterId,

              }

            : {

                chapterId:

                  proposal.sourceChapterId,

              };



        const parsedMemory =

          parseMemoryUpdate(

            memoryPayload

          );



        if (

          parsedMemory.chapterId !==

          proposal.sourceChapterId

        ) {

          throw new ProposalStateError(

            "chapterId Memory Update не совпадает с sourceChapterId"

          );

        }



        const chapter =

          await tx.chapter.findFirst(

            {

              where: {

                id:

                  proposal.sourceChapterId,



                book: {

                  projectId:

                    proposal.projectId,

                },

              },

            }

          );



        if (!chapter) {

          throw new ProposalStateError(

            "Глава Memory Update не найдена"

          );

        }



        if (

          chapter.status !==

          "CANON"

        ) {

          throw new ProposalStateError(

            "Memory Update можно принять только для главы со статусом CANON"

          );

        }



        /**

         * ===================================================

         * CHAPTER SUMMARY

         * ===================================================

         */

        const chapterSummary =

          await tx.chapterSummary.upsert(

            {

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

            }

          );



        await tx.chapter.update(

          {

            where: {

              id:

                chapter.id,

            },



            data: {

              summary:

                parsedMemory.shortSummary,

            },

          }

        );



        /**

         * ===================================================

         * MEMORY CHUNK

         * ===================================================

         */

        const memoryContent =

          [

            `Глава ${chapter.number}`,



            "",



            "КРАТКОЕ РЕЗЮМЕ:",



            parsedMemory.shortSummary,



            "",



            "ПОЛНОЕ РЕЗЮМЕ:",



            parsedMemory.fullSummary,



            "",



            "ИЗМЕНЕНИЯ МИРА:",



            ...parsedMemory

              .worldDelta

              .changes.map(

                (item) =>

                  `- ${item}`

              ),



            "",



            "ОБНОВЛЕНИЯ:",



            ...parsedMemory.updates.map(

              (item) =>

                `- [${item.type}] ${item.title}: ${item.content} (${item.safety})`

            ),



            "",



            "ИЗМЕНЕНИЯ ПЕРСОНАЖЕЙ:",



            ...parsedMemory.characterChanges.map(

              (item) =>

                `- ${item.characterName} / ${item.attribute}: ${item.newValue}`

            ),





            "",



            "ИЗМЕНЕНИЯ ОТНОШЕНИЙ:",



            ...parsedMemory.relationshipChanges.map(

              (item) =>

                `- ${item.sourceCharacterName} → ${item.targetCharacterName} / ${item.relationType}: ${item.newValue}`

            ),

          ].join("\n");



        const memoryChunk =

          await tx.memoryChunk.create(

            {

              data: {

                projectId:

                  proposal.projectId,



                chapterId:

                  chapter.id,



                kind:

                  "SUMMARY",



                content:

                  memoryContent,



                tokenCount:

                  null,



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



                    characterChanges:

                      parsedMemory.characterChanges,



                    relationshipChanges:

                      parsedMemory.relationshipChanges,



                    characterProposals:

                      parsedMemory.characterProposals,

                  }),

              },

            }

          );



        /**

         * ===================================================

         * CHARACTER STATES

         * ===================================================

         *

         * Существующий CANON-персонаж:

         *

         * Character

         *      ↓

         * CharacterState

         *      ↓

         * следующая глава

         *      ↓

         * новый CharacterState

         *

         * Сам Character не перезаписываем.

         */

        const createdCharacterStateIds:

          string[] = [];



        const unresolvedCharacterChanges:

          Array<{

            characterName:

              string;

            attribute:

              string;

          }> = [];



        if (

          parsedMemory.characterChanges

            .length > 0

        ) {

          const canonCharacters =

            await tx.character.findMany(

              {

                where: {

                  projectId:

                    proposal.projectId,



                  status:

                    "CANON",

                },



                select: {

                  id:

                    true,



                  name:

                    true,

                },

              }

            );



          const charactersByName =

            new Map<

              string,

              string

            >();



          for (

            const character of

              canonCharacters

          ) {

            charactersByName.set(

              character.name

                .trim()

                .toLowerCase(),



              character.id

            );

          }



          /**

           * Не допускаем несколько

           * состояний одного атрибута

           * в одной Memory Update.

           *

           * Последнее изменение

           * побеждает.

           */

          const changesByKey =

            new Map<

              string,

              (typeof parsedMemory.characterChanges)[number]

            >();



          for (

            const change of

              parsedMemory.characterChanges

          ) {

            const characterId =

              charactersByName.get(

                change.characterName

                  .trim()

                  .toLowerCase()

              );



            if (

              !characterId

            ) {

              unresolvedCharacterChanges.push(

                {

                  characterName:

                    change.characterName,



                  attribute:

                    change.attribute,

                }

              );



              continue;

            }



            const key =

              `${characterId}:${change.attribute}`;



            changesByKey.set(

              key,

              change

            );

          }



          for (

            const [

              key,

              change,

            ] of changesByKey

          ) {

            const separatorIndex =

              key.indexOf(":");



            const characterId =

              separatorIndex >= 0

                ? key.slice(

                    0,

                    separatorIndex

                  )

                : key;



            if (

              !characterId

            ) {

              continue;

            }



            /**

             * Получаем предыдущее

             * подтверждённое состояние

             * этого атрибута.

             */

            const previousState =

              await tx.characterState.findFirst(

                {

                  where: {

                    characterId,



                    attribute:

                      change.attribute,



                    status:

                      "CANON",

                  },



                  orderBy: {

                    createdAt:

                      "desc",

                  },



                  select: {

                    newValue:

                      true,

                  },

                }

              );



            /**

             * Если старое состояние уже

             * существует — используем его.

             *

             * Это надёжнее, чем доверять

             * oldValue от AI.

             */

            const oldValue =

              previousState

                ? previousState.newValue

                : change.oldValue;



            /**

             * newValue у нас строковый,

             * поэтому здесь вообще не нужен

             * nullable JSON helper.

             *

             * Это устраняет исходную

             * TypeScript ошибку.

             */

            const newValue =

              change.newValue;



            const state =

              await tx.characterState.create(

                {

                  data: {

                    characterId,



                    chapterId:

                      chapter.id,



                    attribute:

                      change.attribute,



                    oldValue:

                      oldValue ===

                      null

                        ? Prisma.JsonNull

                        : toRequiredInputJson(

                            oldValue

                          ),



                    newValue:

                      newValue,



                    reason:

                      change.reason,



                    /**

                     * AI_EXTRACTION —

                     * корректное значение

                     * существующего enum FactSource.

                     */

                    factSource:

                      "AI_EXTRACTION",



                    confidence:

                      change.confidence,



                    status:

                      "CANON",



                    sourceAiRunId:

                      proposal.aiRunId,



                    sourceProposalId:

                      proposal.id,

                  },

                }

              );



            createdCharacterStateIds.push(

              state.id

            );

          }

        }



        /**

         * ===================================================

         * RELATIONSHIP STATES

         * ===================================================

         *

         * Изменение отношения создаёт новую CANON-запись

         * с окном действия в главах. Предыдущая запись

         * того же типа закрывается на главе N-1.

         */

        const createdRelationshipIds:

          string[] = [];



        const unresolvedRelationshipChanges:

          Array<{

            sourceCharacterName:

              string;

            targetCharacterName:

              string;

            relationType:

              string;

          }> = [];



        if (

          parsedMemory.relationshipChanges

            .length > 0

        ) {

          const canonCharacters =

            await tx.character.findMany(

              {

                where: {

                  projectId:

                    proposal.projectId,

                  status:

                    "CANON",

                },

                select: {

                  id:

                    true,

                  name:

                    true,

                },

              }

            );



          const charactersByName =

            new Map<

              string,

              string

            >();



          for (

            const character of

              canonCharacters

          ) {

            charactersByName.set(

              character.name

                .trim()

                .toLowerCase(),

              character.id

            );

          }



          for (

            const change of

              parsedMemory.relationshipChanges

          ) {

            const sourceId =

              charactersByName.get(

                change.sourceCharacterName

                  .trim()

                  .toLowerCase()

              );



            const targetId =

              charactersByName.get(

                change.targetCharacterName

                  .trim()

                  .toLowerCase()

              );



            if (

              !sourceId ||

              !targetId ||

              sourceId === targetId

            ) {

              unresolvedRelationshipChanges.push({

                sourceCharacterName:

                  change.sourceCharacterName,

                targetCharacterName:

                  change.targetCharacterName,

                relationType:

                  change.relationType,

              });

              continue;

            }



            const previousRelationship =

              await tx.relationship.findFirst(

                {

                  where: {

                    projectId:

                      proposal.projectId,

                    sourceId,

                    targetId,

                    relationType:

                      change.relationType,

                    status:

                      "CANON",

                    validFromChapter: {

                      lte:

                        chapter.number,

                    },

                    OR: [

                      {

                        validToChapter:

                          null,

                      },

                      {

                        validToChapter: {

                          gte:

                            chapter.number,

                        },

                      },

                    ],

                  },

                  orderBy: [

                    {

                      validFromChapter:

                        "desc",

                    },

                    {

                      createdAt:

                        "desc",

                    },

                  ],

                }

              );



            if (

              previousRelationship &&

              previousRelationship.validFromChapter !==

                chapter.number

            ) {

              await tx.relationship.update(

                {

                  where: {

                    id:

                      previousRelationship.id,

                  },

                  data: {

                    validToChapter:

                      chapter.number - 1,

                  },

                }

              );

            }



            const relationship =

              await tx.relationship.create(

                {

                  data: {

                    projectId:

                      proposal.projectId,

                    sourceId,

                    targetId,

                    relationType:

                      change.relationType,

                    value:

                      null,

                    reason:

                      change.newValue,

                    validFromChapter:

                      chapter.number,

                    validToChapter:

                      null,

                    lastChangedChapter:

                      chapter.number,

                    sourceChapterId:

                      chapter.id,

                    status:

                      "CANON",

                    factSource:

                      "AI_EXTRACTION",

                    confidence:

                      change.confidence,

                  },

                }

              );



            createdRelationshipIds.push(

              relationship.id

            );

          }

        }



        /**

         * ===================================================

         * НОВЫЕ ПЕРСОНАЖИ

         * ===================================================

         *

         * Новый персонаж НЕ становится CANON.

         *

         * Создаётся отдельный

         * CHARACTER Proposal.

         *

         * Автор потом отдельно

         * принимает его.

         */

        const createdCharacterProposalIds:

          string[] = [];



        if (

          parsedMemory.characterProposals

            .length > 0

        ) {

          const existingCharacters =

            await tx.character.findMany(

              {

                where: {

                  projectId:

                    proposal.projectId,



                  status:

                    "CANON",

                },



                select: {

                  name:

                    true,

                },

              }

            );



          const existingCharacterNames =

            new Set(

              existingCharacters.map(

                (character) =>

                  character.name

                    .trim()

                    .toLowerCase()

              )

            );



          const pendingCharacterProposals =

            await tx.proposal.findMany(

              {

                where: {

                  projectId:

                    proposal.projectId,



                  entityType:

                    "CHARACTER",



                  status:

                    "PENDING",

                },



                select: {

                  payload:

                    true,

                },

              }

            );



          const pendingCharacterNames =

            new Set<string>();



          for (

            const pendingProposal of

              pendingCharacterProposals

          ) {

            const pendingPayload =

              pendingProposal.payload;



            if (

              !pendingPayload ||

              typeof pendingPayload !==

                "object"

            ) {

              continue;

            }



            const payloadObject =

              pendingPayload as Record<

                string,

                unknown

              >;



            const data =

              payloadObject.data;



            if (

              !data ||

              typeof data !==

                "object"

            ) {

              continue;

            }



            const characterData =

              data as Record<

                string,

                unknown

              >;



            if (

              typeof characterData.name ===

                "string" &&

              characterData.name.trim()

            ) {

              pendingCharacterNames.add(

                characterData.name

                  .trim()

                  .toLowerCase()

              );

            }

          }



          for (

            const characterProposal of

              parsedMemory.characterProposals

          ) {

            const normalizedName =

              characterProposal.name

                .trim()

                .toLowerCase();



            if (

              !normalizedName

            ) {

              continue;

            }



            if (

              existingCharacterNames.has(

                normalizedName

              )

            ) {

              continue;

            }



            if (

              pendingCharacterNames.has(

                normalizedName

              )

            ) {

              continue;

            }



            const characterPayload =

              proposalPayloadSchema.parse(

                {

                  entityType:

                    "CHARACTER",



                  data: {

                    name:

                      characterProposal.name.trim(),



                    role:

                      characterProposal.role ??

                      undefined,



                    description:

                      characterProposal.description ??

                      undefined,



                    appearance:

                      characterProposal.appearance ??

                      undefined,



                    history:

                      characterProposal.history ??

                      undefined,



                    personality:

                      characterProposal.personality ??

                      undefined,



                    goals:

                      characterProposal.goals ??

                      undefined,



                    fears:

                      characterProposal.fears ??

                      undefined,



                    beliefs:

                      characterProposal.beliefs ??

                      undefined,



                    values:

                      characterProposal.values ??

                      undefined,



                    abilities:

                      characterProposal.abilities &&
                      typeof characterProposal.abilities ===
                        "object" &&
                      !Array.isArray(
                        characterProposal.abilities
                      )
                        ? characterProposal.abilities
                        : undefined,

                  },

                }

              );



            const characterProposalRecord =

              await tx.proposal.create(

                {

                  data: {

                    projectId:

                      proposal.projectId,



                    entityType:

                      "CHARACTER",



                    entityId:

                      null,



                    op:

                      "CREATE",



                    payload:

                      toRequiredInputJson(

                        characterPayload

                      ),



                    reason:

                      characterProposal.reason,



                    confidence:

                      characterProposal.confidence,



                    safety:

                      characterProposal.safety,



                    aiRunId:

                      proposal.aiRunId,



                    sourceChapterId:

                      chapter.id,



                    impact:

                      toRequiredInputJson({

                        source:

                          "MEMORY_UPDATE",



                        memoryProposalId:

                          proposal.id,



                        chapterId:

                          chapter.id,



                        characterName:

                          characterProposal.name,

                      }),

                  },

                }

              );



            createdCharacterProposalIds.push(

              characterProposalRecord.id

            );



            pendingCharacterNames.add(

              normalizedName

            );

          }

        }



        /**

         * ===================================================

         * MEMORY PROPOSAL ACCEPTED

         * ===================================================

         */

        const updatedProposal =

          await tx.proposal.update(

            {

              where: {

                id:

                  proposal.id,

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



                reviewedAt:

                  new Date(),



                reviewedById:

                  actor.userId,

              },

            }

          );



        /**

         * ===================================================

         * CHANGE LOG

         * ===================================================

         */

        await tx.changeLog.create(

          {

            data: {

              projectId:

                proposal.projectId,



              entityType:

                "memory_update",



              entityId:

                chapter.id,



              op:

                "CREATE",



              before:

                Prisma.JsonNull,



              after:

                toRequiredInputJson({

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



                  characterChanges:

                    parsedMemory.characterChanges,



                  relationshipChanges:

                    parsedMemory.relationshipChanges,



                  createdCharacterStateIds:



                  createdCharacterProposalIds,



                  createdRelationshipIds,



                  unresolvedCharacterChanges,



                  unresolvedRelationshipChanges,

                }),



              actorType:

                "AUTHOR",



              actorId:

                actor.userId,



              proposalId:

                proposal.id,



              aiRunId:

                proposal.aiRunId,



              chapterId:

                chapter.id,

            },

          }

        );



        return {

          proposal:

            updatedProposal,



          canonEntityId:

            chapter.id,



          canonChanged:

            true,



          memoryUpdated:

            true,



          chapterSummaryId:

            chapterSummary.id,



          memoryChunkId:

            memoryChunk.id,



          createdCharacterStateIds,



          createdCharacterProposalIds,



          createdRelationshipIds,



          unresolvedCharacterChanges,



          unresolvedRelationshipChanges,

        };

      }



      /**

       * =====================================================

       * ОБЫЧНЫЕ CANON PROPOSALS

       * =====================================================

       */

      if (

        proposal.op !==

        "CREATE"

      ) {

        throw new ProposalStateError(

          `Операция ${proposal.op} пока не поддерживается шлюзом Canon`

        );

      }



      const parsed =

        proposalPayloadSchema.parse(

          payload

        );



      let canonEntityId =

        proposal.entityId ??

        "";



      switch (

        parsed.entityType

      ) {

        case "CHARACTER": {

          const character =

            await tx.character.create(

              {

                data: {

                  projectId:

                    proposal.projectId,



                  name:

                    parsed.data.name,



                  role:

                    parsed.data.role ??

                    null,



                  description:

                    parsed.data.description ??

                    null,



                  appearance:

                    parsed.data.appearance ??

                    null,



                  history:

                    parsed.data.history ??

                    null,



                  personality:

                    parsed.data.personality ??

                    null,



                  goals:

                    parsed.data.goals ??

                    null,



                  fears:

                    parsed.data.fears ??

                    null,



                  beliefs:

                    parsed.data.beliefs ??

                    null,



                  values:

                    parsed.data.values ??

                    null,



                  abilities:

                    toInputJson(

                      parsed.data.abilities

                    ),



                  status:

                    "CANON",



                  canonLevel:

                    "SOFT",



                  factSource:

                    "AUTHOR",



                  sourceProposalId:

                    proposal.id,

                },

              }

            );



          canonEntityId =

            character.id;



          break;

        }



        case "WORLD_ENTITY": {

          const worldEntity =

            await tx.worldEntity.create(

              {

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

                    parsed.data.description ??

                    null,



                  attributes:

                    toInputJson(

                      parsed.data.attributes

                    ),



                  status:

                    "CANON",



                  canonLevel:

                    "SOFT",



                  factSource:

                    "AUTHOR",



                  sourceProposalId:

                    proposal.id,

                },

              }

            );



          canonEntityId =

            worldEntity.id;



          break;

        }



        case "WORLD_RULE": {

          const worldRule =

            await tx.worldRule.create(

              {

                data: {

                  projectId:

                    proposal.projectId,



                  name:

                    parsed.data.name,



                  statement:

                    parsed.data.statement,



                  explanation:

                    parsed.data.explanation ??

                    null,



                  canonLevel:

                    "HARD",



                  status:

                    "CANON",

                },

              }

            );



          canonEntityId =

            worldRule.id;



          break;

        }



        case "PLOT_LINE": {

          const plotLine =

            await tx.plotLine.create(

              {

                data: {

                  projectId:

                    proposal.projectId,



                  name:

                    parsed.data.name,



                  premise:

                    parsed.data.description ??

                    null,



                  plotStatus:

                    "ACTIVE",



                  status:

                    "CANON",

                },

              }

            );



          canonEntityId =

            plotLine.id;



          break;

        }



        case "EVENT": {

          const event =

            await tx.event.create(

              {

                data: {

                  projectId:

                    proposal.projectId,



                  name:

                    parsed.data.name,



                  description:

                    parsed.data.description ??

                    null,



                  inWorldDate:

                    parsed.data.inWorldDate ??

                    null,



                  cause:

                    parsed.data.cause ??

                    null,



                  consequences:

                    parsed.data.consequences ??

                    null,



                  status:

                    "CANON",



                  canonLevel:

                    "SOFT",

                },

              }

            );



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

        await tx.proposal.update(

          {

            where: {

              id:

                proposal.id,

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



              reviewedAt:

                new Date(),



              reviewedById:

                actor.userId,

            },

          }

        );



      /**

       * ChangeLog.

       */

      await tx.changeLog.create(

        {

          data: {

            projectId:

              proposal.projectId,



            entityType:

              proposal.entityType,



            entityId:

              canonEntityId,



            op:

              proposal.op,



            before:

              Prisma.JsonNull,



            after:

              toInputJson(

                payload

              ),



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

        }

      );



      return {

        proposal:

          updatedProposal,



        canonEntityId,



        canonChanged:

          true,

      };

    }

  );

}