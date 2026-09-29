import { z } from "zod";
import { log } from "../shared/log.js";
import { runKnowledgeBitTagger } from "../mastra/knowledge-bit-tagger.agent.js";
import { assignTagForAutoTag } from "../tag/tag-auto-assign.js";
import { listTags } from "../tag/tag.repo.js";
import {
  assignTagsAndMarkTagged,
  listKnowledgeBitsForTaggingScan,
  markKnowledgeBitTagFailed,
} from "./knowledge-bit-tagging.repo.js";

// Kept well below the embedding scan's cap — this hits a paid LLM call per bit.
export const TAGGING_CAP = 50;

const candidateNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((name) => !name.includes("\n"), { message: "candidate tag name must not contain a newline" });

export interface TagScanCounts {
  scanned: number;
  tagged: number;
  failed: number;
}

// Tag ids are resolved (and, for a new name, created) before the per-bit
// transaction opens — assignTagForAutoTag can call an LLM (matchClosestTag)
// and take its own locked transaction (resolveTagUnderCapGuard), neither of
// which should run while assignTagsAndMarkTagged holds the bit's row lock
// and a pool connection. A tag created here for a scan that then turns out
// stale is simply left with no assignment — harmless beyond counting toward
// the shared taxonomy cap.
async function resolveTagIds(candidateNames: string[], body: string): Promise<string[]> {
  const tagIds: string[] = [];

  for (const candidateName of candidateNames) {
    const tag = await assignTagForAutoTag(candidateName, body);

    tagIds.push(tag.id);
  }

  return tagIds;
}

function validateCandidateNames(candidateNames: string[]): string[] {
  const validated: string[] = [];

  for (const candidateName of candidateNames.slice(0, 3)) {
    const parsed = candidateNameSchema.safeParse(candidateName);

    if (parsed.success) {
      validated.push(parsed.data);
    }
  }

  return validated;
}

export async function tagKnowledgeBits(): Promise<TagScanCounts> {
  const bits = await listKnowledgeBitsForTaggingScan(TAGGING_CAP);

  let tagged = 0;
  let failed = 0;

  for (const bit of bits) {
    try {
      const existingTagNames = (await listTags()).map((tag) => tag.name);
      const candidateNames = await runKnowledgeBitTagger(bit.body, existingTagNames);
      const validatedNames = validateCandidateNames(candidateNames);

      if (validatedNames.length === 0) {
        throw new Error("knowledge_bit_tagging_no_valid_candidates");
      }

      const tagIds = await resolveTagIds(validatedNames, bit.body);
      const stillCurrent = await assignTagsAndMarkTagged(bit.id, tagIds, bit.body);

      if (stillCurrent) {
        tagged += 1;
      } else {
        // The body changed after the scan read it — no tag_assignments row
        // was inserted and taggedAt stays null, so a later scan retries this
        // bit against its current body. Neither tagged nor failed.
        log.info({ knowledgeBitId: bit.id }, "knowledge_bit_tagging_skipped_stale_body");
      }
    } catch (err) {
      log.warn({ err, knowledgeBitId: bit.id }, "knowledge_bit_tagging_failed");

      try {
        await markKnowledgeBitTagFailed(bit.id, bit.body);
      } catch (markErr) {
        log.warn(
          { err: markErr, knowledgeBitId: bit.id },
          "knowledge_bit_tagging_mark_failed_write_failed",
        );
      }

      failed += 1;
    }
  }

  return { scanned: bits.length, tagged, failed };
}
