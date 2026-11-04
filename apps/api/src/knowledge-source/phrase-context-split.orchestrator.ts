import { embedApprovedKnowledgeBits } from "../knowledge-bit/knowledge-bit-approval-embedding.orchestrator.js";
import { log } from "../shared/log.js";
import { applyPhraseContextSplits, type PhraseContextSplit } from "./phrase-sentence-backfill.repo.js";

export async function splitPhraseContextsAndRefreshEmbeddings(splits: readonly PhraseContextSplit[]): Promise<number> {
  const updated = await applyPhraseContextSplits(splits);

  if (updated === 0) {
    return updated;
  }

  const bitIds = [...new Set(splits.map((split) => split.bitId))];

  try {
    await embedApprovedKnowledgeBits(bitIds);
  } catch (err) {
    log.error({ err, bitIds }, "phrase_context_split_embed_failed");
  }

  return updated;
}
