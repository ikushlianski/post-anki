import { eq } from "drizzle-orm";
import type { CreateSubjectCategoryInput, SubjectCategory } from "@post-anki/shared";
import { validateCategoryBelongsToSubject } from "@post-anki/core";
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
