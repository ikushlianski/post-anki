import { z } from "zod";
import { ontologyMergeLogRowSchema } from "./ontology-merge";

export const stuckCurriculumSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  stuckForMs: z.number(),
});

export type StuckCurriculum = z.infer<typeof stuckCurriculumSchema>;

export const llmCallEventSchema = z.object({
  id: z.string(),
  curriculumId: z.string().nullable(),
  curriculumName: z.string().nullable(),
  op: z.string(),
  agentKey: z.string(),
  durationMs: z.number(),
  success: z.boolean(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
});

export type LlmCallEvent = z.infer<typeof llmCallEventSchema>;

export const adminObservabilitySchema = z.object({
  stuckCurricula: z.array(stuckCurriculumSchema),
  recentEvents: z.array(llmCallEventSchema),
  recentMerges: z.array(ontologyMergeLogRowSchema),
});

export type AdminObservability = z.infer<typeof adminObservabilitySchema>;
