import { eq } from "drizzle-orm";
import type { CreateSubjectCategoryInput, SubjectCategory } from "@post-anki/shared";
import { validateCategoryBelongsToSubject, wouldCreateCategoryCycle } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { subjectCategories, subjects } from "../db/schema.js";
import { newId } from "../shared/id.js";

function toSubjectCategory(r: typeof subjectCategories.$inferSelect): SubjectCategory {
  return {
    id: r.id,
    subjectId: r.subjectId,
    parentId: r.parentId,
    name: r.name,
  };
}

export async function listCategoriesForSubject(subjectId: string): Promise<SubjectCategory[]> {
  const rows = await getDb()
    .select()
    .from(subjectCategories)
    .where(eq(subjectCategories.subjectId, subjectId));

  return rows.map(toSubjectCategory);
}

export async function listAllCategories(): Promise<SubjectCategory[]> {
  const rows = await getDb().select().from(subjectCategories);

  return rows.map(toSubjectCategory);
}

export type CreateCategoryError = "subject_not_found" | "parent_wrong_subject";

/**
 * Creates a new category directly under `input.subjectId` (a null
 * `parentId`) or nested under an existing category in the same subject's
 * tree. Both the owning subject and, if given, the parent category are
 * validated to exist and to actually belong together before the insert —
 * SCENARIO 12: a category under a nonexistent subject, or a parent from a
 * different subject, is rejected outright, nothing written.
 */
export async function insertCategory(
  input: CreateSubjectCategoryInput,
): Promise<SubjectCategory | { error: CreateCategoryError }> {
  const subjectRow = (
    await getDb().select().from(subjects).where(eq(subjects.id, input.subjectId))
  )[0];

  if (!subjectRow) {
    return { error: "subject_not_found" as const };
  }

  const parentId = input.parentId ?? null;

  if (parentId !== null) {
    const siblingCategories = await listCategoriesForSubject(input.subjectId);
    const parentBelongs = validateCategoryBelongsToSubject(
      parentId,
      input.subjectId,
      siblingCategories,
    );

    if (!parentBelongs) {
      return { error: "parent_wrong_subject" as const };
    }
  }

  const row = {
    id: newId("cat"),
    subjectId: input.subjectId,
    parentId,
    name: input.name,
    order: 0,
  };

  await getDb().insert(subjectCategories).values(row);

  return toSubjectCategory({ ...row, createdAt: new Date() });
}

export type MoveCategoryError =
  | "category_not_found"
  | "parent_not_found"
  | "parent_wrong_subject"
  | "would_create_cycle";

export async function moveCategory(
  categoryId: string,
  parentId: string | null,
): Promise<SubjectCategory | { error: MoveCategoryError }> {
  const categoryRow = (
    await getDb().select().from(subjectCategories).where(eq(subjectCategories.id, categoryId))
  )[0];

  if (!categoryRow) {
    return { error: "category_not_found" as const };
  }

  if (parentId !== null) {
    const allCategories = await listAllCategories();
    const parentExists = allCategories.some((category) => category.id === parentId);

    if (!parentExists) {
      return { error: "parent_not_found" as const };
    }

    const parentBelongs = validateCategoryBelongsToSubject(
      parentId,
      categoryRow.subjectId,
      allCategories,
    );

    if (!parentBelongs) {
      return { error: "parent_wrong_subject" as const };
    }

    if (wouldCreateCategoryCycle(categoryId, parentId, allCategories)) {
      return { error: "would_create_cycle" as const };
    }
  }

  await getDb().update(subjectCategories).set({ parentId }).where(eq(subjectCategories.id, categoryId));

  return toSubjectCategory({ ...categoryRow, parentId });
}

export type RenameCategoryError = "category_not_found";

export async function renameCategory(
  categoryId: string,
  name: string,
): Promise<SubjectCategory | { error: RenameCategoryError }> {
  const categoryRow = (
    await getDb().select().from(subjectCategories).where(eq(subjectCategories.id, categoryId))
  )[0];

  if (!categoryRow) {
    return { error: "category_not_found" as const };
  }

  await getDb().update(subjectCategories).set({ name }).where(eq(subjectCategories.id, categoryId));

  return toSubjectCategory({ ...categoryRow, name });
}
