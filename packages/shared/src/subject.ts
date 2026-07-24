import { z } from "zod";

export const subjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  requireSources: z.boolean(),
  kind: z.enum(["architecture-mentor", "language-practice"]).default("architecture-mentor"),
});

export type Subject = z.infer<typeof subjectSchema>;

export const createSubjectInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  requireSources: z.boolean().optional(),
  kind: z.enum(["architecture-mentor", "language-practice"]).default("architecture-mentor"),
});

export type CreateSubjectInput = z.infer<typeof createSubjectInput>;
