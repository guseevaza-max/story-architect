import { z } from "zod";
import { COAUTHOR_LIMITS } from "./tiers";

export const tierSchema = z.enum(["LUNA", "TERRA"]);
export const scopeSchema = z.enum(["PROJECT", "TOPIC", "CHAPTER"]);
export const modeSchema = z.enum(["DISCUSSION", "CRITIC"]);

const title = z.string().trim().min(1, "Название беседы не может быть пустым").max(COAUTHOR_LIMITS.titleChars, "Название слишком длинное");

export const createThreadSchema = z
  .object({
    title: title.optional(),
    scope: scopeSchema.default("TOPIC"),
    chapterId: z.string().min(1).optional(),
    defaultTier: tierSchema.default("LUNA"),
    mode: modeSchema.default("DISCUSSION"),
  })
  .refine((v) => v.scope !== "CHAPTER" || !!v.chapterId, {
    message: "Для беседы о главе нужно указать главу",
    path: ["chapterId"],
  })
  .refine((v) => v.mode !== "CRITIC" || (v.scope === "CHAPTER" && !!v.chapterId), {
    message: "Сценарный критик разбирает конкретную главу: выберите главу",
    path: ["mode"],
  });

export const updateThreadSchema = z
  .object({
    title: title.optional(),
    archived: z.boolean().optional(),
    defaultTier: tierSchema.optional(),
  })
  .refine((v) => v.title !== undefined || v.archived !== undefined || v.defaultTier !== undefined, {
    message: "Нечего изменять",
  });

export const sendMessageSchema = z.object({
  text: z.string().trim().min(1, "Сообщение пустое").max(COAUTHOR_LIMITS.messageChars, "Сообщение слишком длинное"),
  tier: tierSchema.optional(),
  fragment: z
    .object({
      chapterId: z.string().min(1),
      text: z.string().min(1).max(COAUTHOR_LIMITS.fragmentChars, "Фрагмент слишком длинный"),
      start: z.number().int().min(0).optional(),
      end: z.number().int().min(0).optional(),
    })
    .optional(),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
