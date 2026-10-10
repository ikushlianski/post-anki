import { log } from "../shared/log.js";
import { detectKnowledgeBits } from "./detect-knowledge-bits.orchestrator.js";
import { generateKnowledgeBitFillBlanks } from "./knowledge-bit-fill-blank-generation.orchestrator.js";
import { generateKnowledgeBitQuestions } from "./knowledge-bit-question-generation.orchestrator.js";

export type KnowledgeBitPipelinePass = { name: string; run: () => Promise<unknown> };

export const KNOWLEDGE_BIT_PIPELINE_PASSES: readonly KnowledgeBitPipelinePass[] = [
  { name: "detect", run: () => detectKnowledgeBits() },
  { name: "wh_question", run: () => generateKnowledgeBitQuestions() },
  { name: "fill_blank", run: () => generateKnowledgeBitFillBlanks() },
];

export function createKnowledgeBitPipelineKick(
  passes: readonly KnowledgeBitPipelinePass[],
): () => Promise<void> {
  let current: Promise<void> | null = null;
  let followUpQueued = false;

  async function runOnce(): Promise<void> {
    const summary: Record<string, unknown> = {};

    for (const pass of passes) {
      try {
        summary[pass.name] = await pass.run();
      } catch (err) {
        summary[pass.name] = "failed";
        log.error({ err, pass: pass.name }, "knowledge_bit_pipeline_kick_pass_failed");
      }
    }

    log.info({ summary }, "knowledge_bit_pipeline_kick_run_done");
  }

  async function runLoop(): Promise<void> {
    try {
      await runOnce();
    } finally {
      if (followUpQueued) {
        followUpQueued = false;
        current = runLoop();
      } else {
        current = null;
      }
    }

    if (current) {
      await current;
    }
  }

  return function kick(): Promise<void> {
    if (current) {
      followUpQueued = true;
      return current;
    }

    current = runLoop();

    return current;
  };
}

export const kickKnowledgeBitPipeline = createKnowledgeBitPipelineKick(KNOWLEDGE_BIT_PIPELINE_PASSES);
