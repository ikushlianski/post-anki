import { desc, eq } from "drizzle-orm";
import type { CreateSubjectInput, Subject } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula, subjects } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { deleteCurriculum } from "../curriculum/curriculum.repo.js";

export async function listSubjects(): Promise<Subject[]> {
  const rows = await getDb()
    .select()
    .from(subjects)
    .orderBy(desc(subjects.createdAt));

  return rows.map(
    (r: typeof subjects.$inferSelect): Subject => ({ id: r.id, name: r.name }),
  );
}

export async function createSubject(input: CreateSubjectInput): Promise<Subject> {
  const row = { id: newId("sub"), name: input.name };

  await getDb().insert(subjects).values(row);

  return { id: row.id, name: row.name };
}

export async function deleteSubject(subjectId: string): Promise<boolean> {
  const db = getDb();

  const existing = (
    await db.select().from(subjects).where(eq(subjects.id, subjectId))
  )[0];

  if (!existing) {
    return false;
  }

  const owned = await db
    .select()
    .from(curricula)
    .where(eq(curricula.subjectId, subjectId));

  for (const c of owned) {
    await deleteCurriculum(c.id);
  }

  await db.delete(subjects).where(eq(subjects.id, subjectId));

  return true;
}
