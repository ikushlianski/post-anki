import { log } from "../shared/log.js";
import { DEFAULT_LEARNING_INTENT, resolveLearningIntent } from "../subject/subject-learning-intent.js";

export { DEFAULT_LEARNING_INTENT };

export type LearningIntentLoader = (subjectId: string | null) => Promise<string>;

export const resolveKnowledgeBitLearningIntent: LearningIntentLoader = resolveLearningIntent;

export async function loadLearningIntentSafely(
  subjectId: string | null,
  sourceId: string,
  load: LearningIntentLoader = resolveKnowledgeBitLearningIntent,
): Promise<string> {
  try {
    const intent = (await load(subjectId)).trim();

    return intent || DEFAULT_LEARNING_INTENT;
  } catch (err) {
    log.warn({ err, knowledgeSourceId: sourceId }, "knowledge_bit_learning_intent_load_failed");

    return DEFAULT_LEARNING_INTENT;
  }
}
