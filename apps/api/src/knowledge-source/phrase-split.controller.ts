import type http from "node:http";
import { phraseSplitResponseSchema } from "@post-anki/shared";
import { sendError, sendJson } from "../shared/http.js";
import { splitPhraseContextsAndRefreshEmbeddings } from "./phrase-context-split.orchestrator.js";
import { listPhraseContextSplits } from "./phrase-sentence-backfill.repo.js";
import { isLivePhraseKnowledgeBit, listPhraseBitVariants } from "./phrase-split.repo.js";
import { getDb } from "../db/client.js";

// POST /knowledge-bits/:id/phrase-splits
export async function handleCreateKnowledgeBitPhraseSplit(res: http.ServerResponse, id: string): Promise<void> {
  if (!(await isLivePhraseKnowledgeBit(id))) {
    sendError(res, 404, "not_found");
    return;
  }

  const splits = await listPhraseContextSplits(getDb(), id);
  const updated = await splitPhraseContextsAndRefreshEmbeddings(splits);
  const variants = await listPhraseBitVariants(id);

  sendJson(res, 200, phraseSplitResponseSchema.parse({ updated, variants }));
}
