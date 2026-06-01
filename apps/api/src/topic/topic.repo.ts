import { eq } from "drizzle-orm";
import type {
  CreateTopicInput,
  DepthLevel,
  LearningStatus,
  Topic,
  TopicProgressStatus,
  UpdateTopicInput,
} from "@post-anki/shared";
import { nextOrder, assignOrders } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { gaps, modules, topics } from "../db/schema.js";
import { newId } from "../shared/id.js";

function rowToTopic(row: typeof topics.$inferSelect): Topic {
  return {
    id: row.id,
    moduleId: row.moduleId,
    title: row.title,
    summary: row.summary ?? undefined,
    order: row.order,
    included: row.included,
    selfGrade: (row.selfGrade as Topic["selfGrade"]) ?? null,
    depth: row.depth as DepthLevel,
    learningStatus: row.learningStatus as LearningStatus,
    questions: [],
    progress: {
      status: row.progressStatus as TopicProgressStatus,
      maturity: row.progressMaturity,
      attempts: row.progressAttempts,
      lastInteractedAt: row.progressLastInteractedAt
        ? row.progressLastInteractedAt.toISOString()
        : null,
    },
  };
}

export async function createTopic(input: CreateTopicInput): Promise<Topic | null> {
  const db = getDb();

  const moduleRow = (
    await db.select().from(modules).where(eq(modules.id, input.moduleId))
  )[0];

  if (!moduleRow) {
    return null;
  }

  const existing = await db
    .select()
    .from(topics)
    .where(eq(topics.moduleId, input.moduleId));

  const row = {
    id: newId("top"),
    moduleId: input.moduleId,
    curriculumId: moduleRow.curriculumId,
    title: input.title,
    summary: input.summary ?? null,
    order: nextOrder(existing.map((t) => t.order)),
    included: true,
    selfGrade: null,
    depth: input.suggestedDepth ?? "working",
    learningStatus: "not_started",
    progressStatus: "not_started",
    progressMaturity: 0,
    progressAttempts: 0,
    progressLastInteractedAt: null,
  };

  await db.insert(topics).values(row);

  return rowToTopic(row as typeof topics.$inferSelect);
}

export async function updateTopic(input: UpdateTopicInput): Promise<Topic | null> {
  const db = getDb();

  const existing = (
    await db.select().from(topics).where(eq(topics.id, input.topicId))
  )[0];

  if (!existing) {
    return null;
  }

  const patch: Partial<typeof topics.$inferInsert> = {};

  if (input.title !== undefined) {
    patch.title = input.title;
  }

  if (input.summary !== undefined) {
    patch.summary = input.summary;
  }

  if (input.order !== undefined) {
    patch.order = input.order;
  }

  if (input.included !== undefined) {
    patch.included = input.included;
  }

  if (input.selfGrade !== undefined) {
    patch.selfGrade = input.selfGrade;
  }

  if (input.depth !== undefined) {
    patch.depth = input.depth;
  }

  if (input.learningStatus !== undefined) {
    patch.learningStatus = input.learningStatus;

    if (input.learningStatus === "skipping" && input.included === undefined) {
      patch.included = false;
    }
  }

  if (input.included === false && input.learningStatus === undefined) {
    patch.learningStatus = "skipping";
  }

  if (
    input.included === true &&
    input.learningStatus === undefined &&
    existing.learningStatus === "skipping"
  ) {
    patch.learningStatus = "not_started";
  }

  if (input.moduleId !== undefined && input.moduleId !== existing.moduleId) {
    const targetModule = (
      await db.select().from(modules).where(eq(modules.id, input.moduleId))
    )[0];

    if (!targetModule) {
      return null;
    }

    const targetTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.moduleId, input.moduleId));

    patch.moduleId = input.moduleId;
    patch.curriculumId = targetModule.curriculumId;

    if (input.order === undefined) {
      patch.order = nextOrder(targetTopics.map((t) => t.order));
    }
  }

  if (Object.keys(patch).length > 0) {
    await db.update(topics).set(patch).where(eq(topics.id, input.topicId));
  }

  return rowToTopic({ ...existing, ...patch } as typeof topics.$inferSelect);
}

export async function deleteTopic(topicId: string): Promise<boolean> {
  const db = getDb();

  const existing = (
    await db.select().from(topics).where(eq(topics.id, topicId))
  )[0];

  if (!existing) {
    return false;
  }

  await db.delete(gaps).where(eq(gaps.topicId, topicId));
  await db.delete(topics).where(eq(topics.id, topicId));

  return true;
}

export async function reorderTopics(orderedIds: string[]): Promise<void> {
  const db = getDb();

  for (const { id, order } of assignOrders(orderedIds)) {
    await db.update(topics).set({ order }).where(eq(topics.id, id));
  }
}
