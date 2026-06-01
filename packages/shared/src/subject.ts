import { z } from "zod";

export const subjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

export type Subject = z.infer<typeof subjectSchema>;

export const createSubjectInput = z.object({
  name: z.string().min(1),
});

export type CreateSubjectInput = z.infer<typeof createSubjectInput>;
