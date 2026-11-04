import { z } from "zod";

// GET /knowledge-bits/pending-review/subjects
export const pendingReviewSubjectCountSchema = z.object({
  subjectId: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  pendingCount: z.number().int().min(1),
});

export const pendingReviewSubjectCountsResponse = z.array(pendingReviewSubjectCountSchema);

export type PendingReviewSubjectCount = z.infer<typeof pendingReviewSubjectCountSchema>;

export function subjectPathLabel(
  subjectId: string,
  byId: ReadonlyMap<string, { name: string; parentId: string | null }>,
): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = subjectId;

  while (cursor && !seen.has(cursor)) {
    const node = byId.get(cursor);

    if (!node) {
      break;
    }

    seen.add(cursor);
    names.unshift(node.name);
    cursor = node.parentId;
  }

  return names.join(" / ");
}
