export interface CategoryOwnershipRef {
  id: string;
  subjectId: string;
}

// The one check both category-create and curriculum-move paths run before
// writing (subject-category-nesting, SCENARIO 8/9/12): a null categoryId is
// always valid (it means "directly under the subject"), and a non-null one
// is valid only if it names a category that actually belongs to the target
// subject — never a category from a different subject's tree.
export function validateCategoryBelongsToSubject(
  categoryId: string | null,
  subjectId: string,
  categories: CategoryOwnershipRef[],
): boolean {
  if (categoryId === null) {
    return true;
  }

  return categories.some(
    (category) => category.id === categoryId && category.subjectId === subjectId,
  );
}
