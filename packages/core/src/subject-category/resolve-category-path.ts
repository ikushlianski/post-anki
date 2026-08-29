export interface CategoryPathRef {
  id: string;
  subjectId: string;
  parentId: string | null;
  name: string;
}

export interface CategoryPathEntry {
  id: string;
  name: string;
}

// The breadcrumb from the subject root down to the target category — used
// both for the category detail page's own breadcrumb trail and for labeling
// a picker option (e.g. joined as "AI > RAG"). `categories` is every
// category belonging to ONE subject; a categoryId this subject's category
// list doesn't contain (null, or a genuinely unknown id) resolves to an
// empty path rather than throwing, since a stale/removed reference must
// never break rendering.
export function resolveCategoryPath(
  categoryId: string | null,
  categories: CategoryPathRef[],
): CategoryPathEntry[] {
  if (categoryId === null) {
    return [];
  }

  const byId = new Map(categories.map((category) => [category.id, category]));
  const path: CategoryPathEntry[] = [];

  let currentId: string | null = categoryId;

  while (currentId !== null) {
    const current = byId.get(currentId);

    if (!current) {
      return [];
    }

    path.unshift({ id: current.id, name: current.name });
    currentId = current.parentId;
  }

  return path;
}
