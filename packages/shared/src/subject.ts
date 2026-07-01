import { z } from "zod";

export const subjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  requireSources: z.boolean(),
});

export type Subject = z.infer<typeof subjectSchema>;

export const createSubjectInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  requireSources: z.boolean().optional(),
});

export type CreateSubjectInput = z.infer<typeof createSubjectInput>;
