import { eq } from "drizzle-orm";
import type {
  CreateModuleInput,
  LearningStatus,
  Module,
  UpdateModuleInput,
} from "@post-anki/shared";
import { moduleProgress, nextOrder, assignOrders } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { gaps, modules, topics } from "../db/schema.js";
import { newId } from "../shared/id.js";

export async function createModule(input: CreateModuleInput): Promise<Module> {
  const db = getDb();

  const existing = await db
    .select()
    .from(modules)
    .where(eq(modules.curriculumId, input.curriculumId));

  const id = newId("mod");
  const order = nextOrder(existing.map((m) => m.order));

  await db.insert(modules).values({
    id,
    curriculumId: input.curriculumId,
    title: input.title,
    order,
  });

  return {
    id,
    curriculumId: input.curriculumId,
    title: input.title,
    order,
    learningStatus: "not_started",
    topics: [],
    progress: moduleProgress([]),
  };
}

export async function updateModule(
  input: UpdateModuleInput,
): Promise<{ id: string; title: string; order: number; learningStatus: LearningStatus } | null> {
  const db = getDb();

  const existing = (
    await db.select().from(modules).where(eq(modules.id, input.moduleId))
  )[0];

  if (!existing) {
    return null;
  }

  const patch: Partial<typeof modules.$inferInsert> = {};

  if (input.title !== undefined) {
    patch.title = input.title;
  }

  if (input.order !== undefined) {
    patch.order = input.order;
  }

  if (input.learningStatus !== undefined) {
    patch.learningStatus = input.learningStatus;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(modules).set(patch).where(eq(modules.id, input.moduleId));
  }

  const row = { ...existing, ...patch };

  return {
    id: row.id,
    title: row.title,
    order: row.order,
    learningStatus: row.learningStatus as LearningStatus,
  };
}

export async function deleteModule(moduleId: string): Promise<boolean> {
  const db = getDb();

  const existing = (
    await db.select().from(modules).where(eq(modules.id, moduleId))
  )[0];

  if (!existing) {
    return false;
  }

  const topicRows = await db
    .select()
    .from(topics)
    .where(eq(topics.moduleId, moduleId));

  for (const t of topicRows) {
    await db.delete(gaps).where(eq(gaps.topicId, t.id));
  }

  await db.delete(topics).where(eq(topics.moduleId, moduleId));
  await db.delete(modules).where(eq(modules.id, moduleId));

  return true;
}

export async function reorderModules(orderedIds: string[]): Promise<void> {
  const db = getDb();

  for (const { id, order } of assignOrders(orderedIds)) {
    await db.update(modules).set({ order }).where(eq(modules.id, id));
  }
}
