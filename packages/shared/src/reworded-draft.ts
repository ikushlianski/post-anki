import { z } from "zod";

export const rewordedDraftAngleSchema = z.enum(["cause", "situation", "gap", "reason"]);

export type RewordedDraftAngle = z.infer<typeof rewordedDraftAngleSchema>;

export const rewordedDraftSchema = z.object({
  id: z.string(),
  knowledgeBitId: z.string(),
  originalPrompt: z.string(),
  answer: z.string(),
  prompt: z.string(),
  angle: rewordedDraftAngleSchema,
  createdAt: z.string(),
});

export type RewordedDraft = z.infer<typeof rewordedDraftSchema>;

export const decideRewordedDraftInputSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

export type DecideRewordedDraftInput = z.infer<typeof decideRewordedDraftInputSchema>;
