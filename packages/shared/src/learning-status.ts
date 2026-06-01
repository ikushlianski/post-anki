import { z } from "zod";

export const learningStatusSchema = z.enum([
  "not_started",
  "probing",
  "going_deeper",
  "skipping",
  "reviewing",
  "done",
]);

export type LearningStatus = z.infer<typeof learningStatusSchema>;
