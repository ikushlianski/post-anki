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

export const moveCategoryInput = z.object({
  parentId: z.string().nullable(),
});

export type MoveCategoryInput = z.infer<typeof moveCategoryInput>;

export const renameCategoryInput = z.object({
  name: z.string().trim().min(1),
});

export type RenameCategoryInput = z.infer<typeof renameCategoryInput>;
