import type { CategoryPathRef } from "./resolve-category-path";

// True when re-parenting `categoryId` under `newParentId` makes the category
// its own ancestor — the parent is the category or one of its descendants.
export function wouldCreateCategoryCycle(
  categoryId: string,
  newParentId: string,
  categories: CategoryPathRef[],
): boolean {
  const byId = new Map(categories.map((category) => [category.id, category]));

  let currentId: string | null = newParentId;

  while (currentId !== null) {
    if (currentId === categoryId) {
      return true;
    }

    const current = byId.get(currentId);

    if (!current) {
      return false;
    }

    currentId = current.parentId;
  }

  return false;
}
