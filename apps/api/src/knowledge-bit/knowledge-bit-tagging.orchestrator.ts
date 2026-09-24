import { z } from "zod";
import { log } from "../shared/log.js";
import { runKnowledgeBitTagger } from "../mastra/knowledge-bit-tagger.agent.js";
import { assignTagForAutoTag } from "../tag/tag-auto-assign.js";
import { assignTag, listTags } from "../tag/tag.repo.js";
import {
  listKnowledgeBitsForTaggingScan,
  markKnowledgeBitTagFailed,
  markKnowledgeBitTagged,
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

      for (const candidateName of validatedNames) {
        const tag = await assignTagForAutoTag(candidateName, bit.body);

        await assignTag(tag.id, "knowledgeBit", bit.id);
      }

      await markKnowledgeBitTagged(bit.id);
      tagged += 1;
    } catch (err) {
      log.warn({ err, knowledgeBitId: bit.id }, "knowledge_bit_tagging_failed");

      try {
        await markKnowledgeBitTagFailed(bit.id);
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
