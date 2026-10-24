import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources, subjects } from "../db/schema.js";
import { newId } from "../shared/id.js";

export const COMMON_SUBJECT_NAME = "Common";

export type SubjectAssignmentError = "subject_not_found" | "subject_has_children";

export async function findSubjectAssignmentError(
  subjectId: string,
  db: DbExecutor = getDb(),
): Promise<SubjectAssignmentError | null> {
  const [row] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)).limit(1);

  if (!row) {
    return "subject_not_found";
  }

  const [child] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.parentId, subjectId))
    .limit(1);

  return child ? "subject_has_children" : null;
}

export async function listParentSubjectIds(db: DbExecutor = getDb()): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ parentId: subjects.parentId })
    .from(subjects)
    .where(isNotNull(subjects.parentId));

  return new Set(rows.flatMap((row) => (row.parentId === null ? [] : [row.parentId])));
}

export async function listLeafSubjectIds(db: DbExecutor = getDb()): Promise<string[]> {
  const parents = await listParentSubjectIds(db);
  const rows = await db.select({ id: subjects.id }).from(subjects);

  return rows.map((row) => row.id).filter((id) => !parents.has(id));
}

export async function ensureCommonSubject(parentId: string, db: DbExecutor): Promise<string> {
  const [existing] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.parentId, parentId), eq(subjects.name, COMMON_SUBJECT_NAME)))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [parent] = await db.select().from(subjects).where(eq(subjects.id, parentId)).limit(1);
  const [last] = await db
    .select({ sortOrder: subjects.sortOrder })
    .from(subjects)
    .where(eq(subjects.parentId, parentId))
    .orderBy(sql`${subjects.sortOrder} desc nulls last`)
    .limit(1);
  const id = newId("sub");

  await db.insert(subjects).values({
    id,
    name: COMMON_SUBJECT_NAME,
    kind: parent?.kind ?? "architecture-mentor",
    requireSources: parent?.requireSources ?? false,
    parentId,
    sortOrder: (last?.sortOrder ?? 0) + 1,
  });

  return id;
}

export async function moveSourcesToCommon(
  parentId: string,
  db: DbExecutor,
  knownCommonId?: string,
): Promise<number> {
  const attached = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.subjectId, parentId));

  if (attached.length === 0) {
    return 0;
  }

  const commonId = knownCommonId ?? (await ensureCommonSubject(parentId, db));

  await db
    .update(knowledgeSources)
    .set({ subjectId: commonId })
    .where(
      inArray(
        knowledgeSources.id,
        attached.map((row) => row.id),
      ),
    );

  return attached.length;
}

export async function hasChildSubjects(parentId: string, db: DbExecutor): Promise<boolean> {
  const [child] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.parentId, parentId))
    .limit(1);

  return child !== undefined;
}

export async function absorbParentItemsOnFirstChild(
  parentId: string,
  child: { id: string; name: string },
  hadChildren: boolean,
  db: DbExecutor,
): Promise<void> {
  if (hadChildren) {
    return;
  }

  await moveSourcesToCommon(parentId, db, child.name === COMMON_SUBJECT_NAME ? child.id : undefined);
}
