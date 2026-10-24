import { getDb } from "../db/client.js";
import { subjects } from "../db/schema.js";
import { DEFAULT_LEARNING_INTENT, pickLearningIntent } from "@post-anki/shared";

export {
  BUSINESS_LEARNING_INTENT,
  DEFAULT_INTENT_BY_ROOT_NAME,
  DEFAULT_LEARNING_INTENT,
  pickLearningIntent,
} from "@post-anki/shared";

export async function resolveLearningIntent(subjectId: string | null): Promise<string> {
  if (!subjectId) {
    return DEFAULT_LEARNING_INTENT;
  }

  const rows = await getDb()
    .select({
      id: subjects.id,
      parentId: subjects.parentId,
      name: subjects.name,
      learningIntent: subjects.learningIntent,
    })
    .from(subjects);

  return pickLearningIntent(subjectId, rows);
}
