import { log } from "../shared/log.js";

export const DEFAULT_LEARNING_INTENT =
  "Learn transferable principles and rules the learner can apply later, not the author's personal story, dates, names or one-off facts.";

export type LearningIntentLoader = (subjectId: string | null) => Promise<string>;

export const resolveKnowledgeBitLearningIntent: LearningIntentLoader = async () => DEFAULT_LEARNING_INTENT;

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
