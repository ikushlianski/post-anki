import { z } from "zod";

// subject-category-nesting — a category sits between a subject and its
// curricula, purely for organizing which courses live where. Self-
// referential (parentId), structurally unlimited nesting, though real usage
// today is one level deep.
export const subjectCategorySchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  parentId: z.string().nullable(),
  name: z.string().min(1),
});

export type SubjectCategory = z.infer<typeof subjectCategorySchema>;

export const createSubjectCategoryInput = z.object({
  subjectId: z.string(),
  parentId: z.string().nullable().optional(),
  name: z.string().min(1),
});

export type CreateSubjectCategoryInput = z.infer<typeof createSubjectCategoryInput>;
