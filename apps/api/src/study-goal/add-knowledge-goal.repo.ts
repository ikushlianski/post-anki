import { asc, eq } from "drizzle-orm";
import type { AddKnowledgeGoal, PutAddKnowledgeGoalInput } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { addKnowledgeGoals, subjectPriorities } from "../db/schema.js";
import { newId } from "../shared/id.js";

const columns = {
  id: addKnowledgeGoals.id,
  subjectId: addKnowledgeGoals.subjectId,
  period: addKnowledgeGoals.period,
  targetNotes: addKnowledgeGoals.targetNotes,
};

export async function listAddKnowledgeGoals(db: DbExecutor = getDb()): Promise<AddKnowledgeGoal[]> {
  const rows = await db.select(columns).from(addKnowledgeGoals).orderBy(asc(addKnowledgeGoals.createdAt));

  return rows as AddKnowledgeGoal[];
}

export async function upsertAddKnowledgeGoal(
  input: PutAddKnowledgeGoalInput,
  db: DbExecutor = getDb(),
): Promise<AddKnowledgeGoal> {
  const [row] = await db
    .insert(addKnowledgeGoals)
    .values({ id: newId("akgoal"), ...input })
    .onConflictDoUpdate({
      target: addKnowledgeGoals.subjectId,
      set: { period: input.period, targetNotes: input.targetNotes },
    })
    .returning(columns);

  return row as AddKnowledgeGoal;
}

export async function deleteAddKnowledgeGoal(id: string, db: DbExecutor = getDb()): Promise<boolean> {
  const rows = await db
    .delete(addKnowledgeGoals)
    .where(eq(addKnowledgeGoals.id, id))
    .returning({ id: addKnowledgeGoals.id });

  return rows.length > 0;
}

export async function deleteSubjectGoals(subjectId: string, db: DbExecutor = getDb()): Promise<void> {
  await db.delete(addKnowledgeGoals).where(eq(addKnowledgeGoals.subjectId, subjectId));
  await db.delete(subjectPriorities).where(eq(subjectPriorities.subjectId, subjectId));
}
