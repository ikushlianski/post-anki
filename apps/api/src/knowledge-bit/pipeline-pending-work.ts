import { listKnowledgeBitsForBasicCardGenerationScan } from "./knowledge-bit-basic-card-claim.repo.js";
import { listKnowledgeBitsForEmbeddingScan } from "./knowledge-bit-embedding.repo.js";
import { listKnowledgeBitsForFillBlankGenerationScan } from "./knowledge-bit-fill-blank-claim.repo.js";
import { listQuestionVariantsForEmbeddingScan } from "./knowledge-bit-question-variant.repo.js";
import { listKnowledgeBitsForTaggingScan } from "./knowledge-bit-tagging.repo.js";
import { listKnowledgeBitsForWhQuestionGenerationScan } from "./knowledge-bit-wh-question-claim.repo.js";

export async function hasPendingBitWork(): Promise<boolean> {
  const lists = await Promise.all([
    listKnowledgeBitsForEmbeddingScan(1),
    listKnowledgeBitsForTaggingScan(1),
    listKnowledgeBitsForWhQuestionGenerationScan(1),
    listKnowledgeBitsForFillBlankGenerationScan(1),
    listKnowledgeBitsForBasicCardGenerationScan(1),
    listQuestionVariantsForEmbeddingScan(1),
  ]);

  return lists.some((rows) => rows.length > 0);
}
