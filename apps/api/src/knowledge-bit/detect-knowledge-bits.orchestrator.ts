import { log } from "../shared/log.js";
import { runKnowledgeBitDetector } from "../mastra/knowledge-bit-detector.agent.js";
import {
  claimPendingKnowledgeSources,
  insertKnowledgeBitsAndMarkDetected,
  markKnowledgeSourceFailed,
  type PendingKnowledgeSource,
} from "./knowledge-bit.repo.js";

export const DETECT_BITS_BATCH_CAP = 20;
export const MAX_SOURCE_CHARS = 50_000;

export interface DetectKnowledgeBitsDeps {
  claim: (limit: number) => Promise<PendingKnowledgeSource[]>;
  detect: (sourceText: string) => Promise<string[]>;
  insertBitsAndMarkDetected: (sourceId: string, bits: string[]) => Promise<void>;
  markFailed: (id: string, reason: string) => Promise<void>;
}

export function defaultDetectKnowledgeBitsDeps(): DetectKnowledgeBitsDeps {
  return {
    claim: claimPendingKnowledgeSources,
    detect: runKnowledgeBitDetector,
    insertBitsAndMarkDetected: insertKnowledgeBitsAndMarkDetected,
    markFailed: markKnowledgeSourceFailed,
  };
}

export interface DetectKnowledgeBitsResult {
  processed: number;
  detected: number;
  failed: number;
}

function truncateReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  return message.slice(0, 200);
}

async function detectBitsForSource(
  source: PendingKnowledgeSource,
  deps: DetectKnowledgeBitsDeps,
): Promise<"detected" | "failed"> {
  const rawText = source.rawText;

  if (!rawText || rawText.length === 0) {
    await deps.markFailed(source.id, "source_empty");

    return "failed";
  }

  if (rawText.length > MAX_SOURCE_CHARS) {
    await deps.markFailed(source.id, "source_too_long");

    return "failed";
  }

  try {
    const bits = await deps.detect(rawText);

    await deps.insertBitsAndMarkDetected(source.id, bits);

    return "detected";
  } catch (err) {
    log.error({ err, knowledgeSourceId: source.id }, "knowledge_bit_detection_failed");
    await deps.markFailed(source.id, truncateReason(err));

    return "failed";
  }
}

export async function detectKnowledgeBits(
  deps: DetectKnowledgeBitsDeps = defaultDetectKnowledgeBitsDeps(),
): Promise<DetectKnowledgeBitsResult> {
  const result: DetectKnowledgeBitsResult = { processed: 0, detected: 0, failed: 0 };

  while (result.processed < DETECT_BITS_BATCH_CAP) {
    const claimed = await deps.claim(1);
    const source = claimed[0];

    if (!source) {
      break;
    }

    result.processed += 1;

    let outcome: "detected" | "failed";

    try {
      outcome = await detectBitsForSource(source, deps);
    } catch (err) {
      log.error({ err, knowledgeSourceId: source.id }, "knowledge_bit_detection_source_errored");
      outcome = "failed";
    }

    if (outcome === "detected") {
      result.detected += 1;
    } else {
      result.failed += 1;
    }
  }

  log.info(result, "knowledge_bit_detection_batch_done");

  return result;
}
