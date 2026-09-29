import { log } from "../shared/log.js";
import { runKnowledgeBitPlacer } from "../mastra/knowledge-bit-placer.agent.js";
import {
  listKnowledgeBitsForPlacementScan,
  listTopicsForPlacement,
  markKnowledgeBitMatched,
  markKnowledgeBitPlacementFailed,
  markKnowledgeBitSuggested,
} from "./knowledge-bit-placement.repo.js";

// Kept well below the embedding scan's cap — this hits a paid LLM call per bit.
export const PLACEMENT_CAP = 50;

// A blank/whitespace-only suggestion would still pass the agent's own refine (it only checks
// null vs non-null) and, once written, permanently removes the bit from the scan queue with no
// usable placement — so it's validated here before being persisted.
const MAX_SUGGESTION_LENGTH = 300;

function isUsableSuggestion(suggestion: string): boolean {
  const trimmed = suggestion.trim();

  return trimmed.length > 0 && trimmed.length <= MAX_SUGGESTION_LENGTH;
}

export interface PlacementScanCounts {
  scanned: number;
  matched: number;
  suggested: number;
  failed: number;
}

export async function placeKnowledgeBits(): Promise<PlacementScanCounts> {
  const topics = await listTopicsForPlacement();
  const topicIds = new Set(topics.map((topic) => topic.topicId));
  const bits = await listKnowledgeBitsForPlacementScan(PLACEMENT_CAP);

  let matched = 0;
  let suggested = 0;
  let failed = 0;

  for (const bit of bits) {
    try {
      const { matchedTopicId, suggestedPlacement } = await runKnowledgeBitPlacer(bit.body, topics);

      if (matchedTopicId !== null) {
        if (topicIds.has(matchedTopicId)) {
          await markKnowledgeBitMatched(bit.id, matchedTopicId, bit.body);
          matched += 1;
        } else {
          await markKnowledgeBitPlacementFailed(bit.id, bit.body);
          failed += 1;
        }
      } else if (suggestedPlacement !== null && isUsableSuggestion(suggestedPlacement)) {
        await markKnowledgeBitSuggested(bit.id, suggestedPlacement.trim(), bit.body);
        suggested += 1;
      } else {
        await markKnowledgeBitPlacementFailed(bit.id, bit.body);
        failed += 1;
      }
    } catch (err) {
      log.warn({ err, knowledgeBitId: bit.id }, "knowledge_bit_placement_failed");

      try {
        await markKnowledgeBitPlacementFailed(bit.id, bit.body);
      } catch (markErr) {
        log.warn(
          { err: markErr, knowledgeBitId: bit.id },
          "knowledge_bit_placement_mark_failed_write_failed",
        );
      }

      failed += 1;
    }
  }

  return { scanned: bits.length, matched, suggested, failed };
}
