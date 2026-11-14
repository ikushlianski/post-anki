import { z } from "zod";
import { listSubjects } from "../subject/subject.repo.js";

export const listSubjectsInputSchema = z.object({});

export const listSubjectsResultSchema = z.object({
  subjects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      parentId: z.string().nullable(),
      depth: z.number().int(),
      cardCount: z.number().int().nullable(),
    }),
  ),
});

export type ListSubjectsResult = z.infer<typeof listSubjectsResultSchema>;

// Depth-first order, parents before children, siblings by sortOrder then name.
export async function listSubjectTree(): Promise<ListSubjectsResult> {
  const all = await listSubjects();
  const ids = new Set(all.map((subject) => subject.id));
  const children = new Map<string | null, typeof all>();

  for (const subject of all) {
    const key = subject.parentId && ids.has(subject.parentId) ? subject.parentId : null;

    children.set(key, [...(children.get(key) ?? []), subject]);
  }

  const out: ListSubjectsResult["subjects"] = [];

  const walk = (parentId: string | null, parentPath: string, depth: number) => {
    const siblings = [...(children.get(parentId) ?? [])].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
    );

    for (const subject of siblings) {
      const path = parentPath ? `${parentPath}/${subject.name}` : subject.name;

      out.push({
        id: subject.id,
        name: subject.name,
        path,
        parentId: subject.parentId,
        depth,
        cardCount: subject.cardCount ?? null,
      });
      walk(subject.id, path, depth + 1);
    }
  };

  walk(null, "", 0);

  return { subjects: out };
}
