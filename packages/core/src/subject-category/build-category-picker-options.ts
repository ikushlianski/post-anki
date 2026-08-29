import { resolveCategoryPath, type CategoryPathRef } from "./resolve-category-path";

export interface CategoryPickerOption {
  nodeId: string | null;
  label: string;
  depth: number;
}

// One subject's full tree-position picker: the subject root itself
// (`nodeId: null`, depth 0 — "directly under the subject") plus one entry
// per category, each labeled with its full breadcrumb path (e.g.
// "AI > RAG") so a searchable dropdown reads unambiguously even once
// nesting goes beyond one level. `categories` may be the full flat list of
// every subject's categories — this filters to `subjectId`'s own categories
// itself, so the picker can never reach into another subject's tree.
export function buildCategoryPickerOptions(
  categories: CategoryPathRef[],
  subjectId: string,
  subjectName: string,
): CategoryPickerOption[] {
  const ownCategories = categories.filter((category) => category.subjectId === subjectId);
  const options: CategoryPickerOption[] = [
    { nodeId: null, label: subjectName, depth: 0 },
  ];

  for (const category of ownCategories) {
    const path = resolveCategoryPath(category.id, ownCategories);
    const label = [subjectName, ...path.map((entry) => entry.name)].join(" > ");

    options.push({ nodeId: category.id, label, depth: path.length });
  }

  return options;
}
