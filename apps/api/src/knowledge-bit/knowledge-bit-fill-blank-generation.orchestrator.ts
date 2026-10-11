import { z } from "zod";
import { log } from "../shared/log.js";
import { mapWithConcurrency } from "../shared/map-with-concurrency.js";
import { runKnowledgeBitFillBlankGenerator } from "../mastra/knowledge-bit-fill-blank-generator.agent.js";
import {
  looksLikeDifferentScript,
  looksLikeSourceMetaReference,
} from "./knowledge-bit-language-guard.js";
import {
  listKnowledgeBitsForFillBlankGenerationScan,
  recordGeneratedFillBlankVariant,
  markFillBlankGenerationFailed,
  claimKnowledgeBitForFillBlankGeneration,
} from "./knowledge-bit-fill-blank-claim.repo.js";

// Kept well below the embedding scan's cap — this hits a paid LLM call per bit.
export const FILL_BLANK_GENERATION_CAP = 50;

const ITEM_CONCURRENCY = 4;

type ItemOutcome = "generated" | "failed" | "skipped";

const fillBlankTextSchema = z.string().trim().min(1).max(2000);

// \p{Pc} catches every underscore-shaped Unicode lookalike; `(?!_)` excludes a real 1-2 char
// ASCII run (max_connections) since only a 3+ run counts as a blank. Extras cover non-Pc lookalikes.
const BLANK_LOOKALIKE_EXTRA_CHARS = "‗‾̲ˍ⎽▁";
const VISIBLE_BLANK_RUN = new RegExp(
  `_{3,}|(?:(?!_)[\\p{Pc}${BLANK_LOOKALIKE_EXTRA_CHARS}])+`,
  "gu",
);
const ALPHANUMERIC = /[\p{L}\p{N}]/u;
const HAS_LETTER = /\p{L}/u;

// Exactly one visible-blank run must exist, be the literal ____ marker, not touch a letter/digit
// on either side, and have real alphabetic text (not just punctuation) around it.
function isWellFormedFillBlankPrompt(prompt: string): boolean {
  const runs = [...prompt.matchAll(VISIBLE_BLANK_RUN)];

  if (runs.length !== 1) {
    return false;
  }

  const run = runs[0]!;
  const start = run.index;
  const matchedText = run[0];

  if (matchedText !== "____" || start === undefined) {
    return false;
  }

  const before = prompt.slice(0, start);
  const after = prompt.slice(start + matchedText.length);

  if (ALPHANUMERIC.test(before.at(-1) ?? "") || ALPHANUMERIC.test(after.at(0) ?? "")) {
    return false;
  }

  return HAS_LETTER.test(before) || HAS_LETTER.test(after);
}

function normalizeSentence(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface FillBlankGenerationScanCounts {
  scanned: number;
  generated: number;
  failed: number;
  skipped: number;
}

export async function generateKnowledgeBitFillBlanks(): Promise<FillBlankGenerationScanCounts> {
  const bits = await listKnowledgeBitsForFillBlankGenerationScan(FILL_BLANK_GENERATION_CAP);

  const outcomes = await mapWithConcurrency(
    bits,
    ITEM_CONCURRENCY,
    async (bit): Promise<ItemOutcome> => {
      // Claim before ever calling the LLM — a concurrently running scan that already claimed (or
      // finished) this bit makes this claim fail, and we skip it without paying for a generation.
      const claimToken = await claimKnowledgeBitForFillBlankGeneration(bit.id, bit.body);

      if (!claimToken) {
        return "skipped";
      }

      try {
        const result = await runKnowledgeBitFillBlankGenerator(bit.body);
        const sentence = fillBlankTextSchema.safeParse(result.sentence);
        const prompt = fillBlankTextSchema.safeParse(result.prompt);
        const answer = fillBlankTextSchema.safeParse(result.answer);
        const wellFormed = prompt.success && isWellFormedFillBlankPrompt(prompt.data);
        const answerMatchesSentence =
          wellFormed &&
          sentence.success &&
          answer.success &&
          // A replacer function, never a plain string, so a literal "$" in the answer (e.g. a price
          // or a regex-flavored term) is never reinterpreted as a $-pattern by String.replace.
          normalizeSentence(prompt.data.replace("____", () => answer.data)) ===
            normalizeSentence(sentence.data);

        if (!sentence.success || !prompt.success || !answer.success || !answerMatchesSentence) {
          throw new Error("knowledge_bit_fill_blank_generation_invalid_output");
        }

        const generatedTexts = [result.sentence, result.prompt, result.answer];

        if (generatedTexts.some((text) => looksLikeDifferentScript(bit.body, text))) {
          throw new Error("knowledge_bit_fill_blank_generation_wrong_language");
        }

        if (generatedTexts.some((text) => looksLikeSourceMetaReference(bit.body, text))) {
          throw new Error("knowledge_bit_fill_blank_generation_source_meta_reference");
        }

        await recordGeneratedFillBlankVariant(
          bit.id,
          "fill_in_the_blank",
          0,
          prompt.data,
          answer.data,
          claimToken,
        );
        return "generated";
      } catch (err) {
        log.warn({ err, knowledgeBitId: bit.id }, "knowledge_bit_fill_blank_generation_failed");

        try {
          await markFillBlankGenerationFailed(bit.id, claimToken);
        } catch (markErr) {
          log.warn(
            { err: markErr, knowledgeBitId: bit.id },
            "knowledge_bit_fill_blank_generation_mark_failed_write_failed",
          );
        }

        return "failed";
      }
    },
  );

  let generated = 0;
  let failed = 0;
  let skipped = 0;

  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      throw outcome.reason;
    }

    if (outcome.value === "generated") {
      generated += 1;
    } else if (outcome.value === "failed") {
      failed += 1;
    } else {
      skipped += 1;
    }
  }

  return { scanned: bits.length, generated, failed, skipped };
}
