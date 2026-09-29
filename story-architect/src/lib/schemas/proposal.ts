import { z } from "zod";

export const characterProposalSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  description: z.string().optional(),
  appearance: z.string().optional(),
  history: z.string().optional(),
  personality: z.string().optional(),
  goals: z.string().optional(),
  fears: z.string().optional(),
  beliefs: z.string().optional(),
  values: z.string().optional(),
  abilities: z.record(z.unknown()).optional(),
});

export const worldEntityProposalSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export const worldRuleProposalSchema = z.object({
  name: z.string().min(1),
  statement: z.string().min(1),
  explanation: z.string().optional(),
});

export const plotLineProposalSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
});

export const eventProposalSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inWorldDate: z.string().optional(),
  cause: z.string().optional(),
  consequences: z.string().optional(),
});

export const proposalPayloadSchema = z.discriminatedUnion("entityType", [
  z.object({
    entityType: z.literal("CHARACTER"),
    data: characterProposalSchema,
  }),
  z.object({
    entityType: z.literal("WORLD_ENTITY"),
    data: worldEntityProposalSchema,
  }),
  z.object({
    entityType: z.literal("WORLD_RULE"),
    data: worldRuleProposalSchema,
  }),
  z.object({
    entityType: z.literal("PLOT_LINE"),
    data: plotLineProposalSchema,
  }),
  z.object({
    entityType: z.literal("EVENT"),
    data: eventProposalSchema,
  }),
]);

export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;