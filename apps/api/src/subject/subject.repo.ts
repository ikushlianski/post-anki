import { desc, eq } from "drizzle-orm";
import type { CreateSubjectInput, Subject } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula, subjects } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { deleteCurriculum } from "../curriculum/curriculum.repo.js";

function toSubject(r: typeof subjects.$inferSelect): Subject {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    requireSources: r.requireSources,
  };
}

export async function listSubjects(): Promise<Subject[]> {
  const rows = await getDb()
    .select()
    .from(subjects)
    .orderBy(desc(subjects.createdAt));

  return rows.map(toSubject);
}

export async function getSubject(subjectId: string): Promise<Subject | null> {
  const row = (
    await getDb().select().from(subjects).where(eq(subjects.id, subjectId))
  )[0];

  return row ? toSubject(row) : null;
}

export async function createSubject(input: CreateSubjectInput): Promise<Subject> {
  const row = {
    id: newId("sub"),
    name: input.name,
    description: input.description ?? null,
    requireSources: input.requireSources ?? false,
  };

  await getDb().insert(subjects).values(row);

  return toSubject({ ...row, createdAt: new Date() });
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
