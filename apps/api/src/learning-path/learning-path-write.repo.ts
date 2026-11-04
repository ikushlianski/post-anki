import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { learningPathSteps, learningPaths } from "../db/schema.js";
import { newId } from "../shared/id.js";
import {
  toLearningPath,
  toLearningPathStep,
  type LearningPathRecord,
  type LearningPathStepRecord,
} from "./learning-path-read.repo.js";

export interface CreateLearningPathParams {
  name: string;
  targetRoleLabel: string;
  orderedDomainNodeIds: string[];
}

export async function insertLearningPath(
  params: CreateLearningPathParams,
): Promise<{ path: LearningPathRecord; steps: LearningPathStepRecord[] }> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const now = new Date();

    const insertedPath = (
      await tx
        .insert(learningPaths)
        .values({
          id: newId("lpath"),
          name: params.name,
          targetRoleLabel: params.targetRoleLabel,
          status: "active",
          startedAt: now,
        })
        .returning()
    )[0]!;

    const stepRows =
      params.orderedDomainNodeIds.length > 0
        ? await tx
            .insert(learningPathSteps)
            .values(
              params.orderedDomainNodeIds.map((domainNodeId, index) => ({
                id: newId("lstep"),
                pathId: insertedPath.id,
                domainNodeId,
                order: index,
              })),
            )
            .returning()
        : [];

    return {
      path: toLearningPath(insertedPath),
      steps: stepRows.map(toLearningPathStep),
    };
  });
}

export async function abandonLearningPath(pathId: string): Promise<LearningPathRecord | null> {
  const db = getDb();

  const updated = (
    await db
      .update(learningPaths)
      .set({ status: "abandoned" })
      .where(and(eq(learningPaths.id, pathId), ne(learningPaths.status, "completed")))
      .returning()
  )[0];

  if (updated) {
    return toLearningPath(updated);
  }

  const existing = (await db.select().from(learningPaths).where(eq(learningPaths.id, pathId)))[0];

  return existing ? toLearningPath(existing) : null;
}

export async function markLearningPathCompletedIfDue(
  pathId: string,
  completedAt: Date,
): Promise<void> {
  const db = getDb();

  await db
    .update(learningPaths)
    .set({ status: "completed", completedAt })
    .where(
      and(
        eq(learningPaths.id, pathId),
        eq(learningPaths.status, "active"),
        isNull(learningPaths.completedAt),
      ),
    );
}
