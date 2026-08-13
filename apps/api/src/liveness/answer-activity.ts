import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { topics } from "../db/schema.js";
import { getLearningListItemByCurriculumId } from "../learning-list/learning-list.repo.js";
import { releaseNextSliceSafely } from "../learning-list/slice-release.js";
import { log } from "../shared/log.js";
import { recordLivenessActivity } from "./liveness.repo.js";

export async function recordAnswerActivity(
  curriculumId: string | null,
  now: string = new Date().toISOString(),
): Promise<void> {
  if (curriculumId === null || curriculumId.length === 0) {
    return;
  }

  try {
    const item = await getLearningListItemByCurriculumId(curriculumId);

    await Promise.all([
      recordLivenessActivity({ entityType: "curriculum", entityId: curriculumId }, now),
      item === null
        ? Promise.resolve(false)
        : recordLivenessActivity({ entityType: "learning_list_item", entityId: item.id }, now),
    ]);

    if (item !== null) {
      await releaseNextSliceSafely(item.id, now);
    }
  } catch (err) {
    log.error({ err, curriculumId }, "answer_activity_record_failed");
  }
}

export async function recordAnswerActivityForTopic(
  topicId: string,
  now: string = new Date().toISOString(),
): Promise<void> {
  try {
    const row = (
      await getDb()
        .select({ curriculumId: topics.curriculumId })
        .from(topics)
        .where(eq(topics.id, topicId))
        .limit(1)
    )[0];

    if (!row) {
      return;
    }

    await recordAnswerActivity(row.curriculumId, now);
  } catch (err) {
    log.error({ err, topicId }, "answer_activity_record_failed");
  }
}
