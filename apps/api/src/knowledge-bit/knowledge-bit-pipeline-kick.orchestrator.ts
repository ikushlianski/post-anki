import { log } from "../shared/log.js";
import { detectKnowledgeBits } from "./detect-knowledge-bits.orchestrator.js";
import { generateKnowledgeBitQuestions } from "./knowledge-bit-question-generation.orchestrator.js";
import { generateKnowledgeBitFillBlanks } from "./knowledge-bit-fill-blank-generation.orchestrator.js";

export interface KnowledgeBitPipelinePass {
  name: string;
  run: () => Promise<unknown>;
}

export const KNOWLEDGE_BIT_PIPELINE_PASSES: readonly KnowledgeBitPipelinePass[] = [
  { name: "detect", run: detectKnowledgeBits },
  { name: "wh_question", run: generateKnowledgeBitQuestions },
  { name: "fill_blank", run: generateKnowledgeBitFillBlanks },
];

export function createKnowledgeBitPipelineKick(
  passes: readonly KnowledgeBitPipelinePass[],
): () => Promise<void> {
  let current: Promise<void> | null = null;
  let followUpQueued = false;

  async function runOnce(): Promise<void> {
    const results: Record<string, unknown | "failed"> = {};

    for (const pass of passes) {
      try {
        results[pass.name] = await pass.run();
      } catch (err) {
        log.error({ err, pass: pass.name }, "knowledge_bit_pipeline_kick_pass_failed");
        results[pass.name] = "failed";
      }
    }

    log.info(results, "knowledge_bit_pipeline_kick_run_done");
  }

  function kick(): Promise<void> {
    if (current !== null) {
      followUpQueued = true;
      return current;
    }

    current = runOnce().finally(() => {
      if (followUpQueued) {
        followUpQueued = false;
        current = runOnce().finally(() => {
          current = null;
        });
      } else {
        current = null;
      }
    });

    return current;
  }

  return kick;
}

export const kickKnowledgeBitPipeline = createKnowledgeBitPipelineKick(
  KNOWLEDGE_BIT_PIPELINE_PASSES,
);
