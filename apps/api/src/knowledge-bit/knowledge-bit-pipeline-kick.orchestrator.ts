import { log } from "../shared/log.js";
import { detectKnowledgeBits } from "./detect-knowledge-bits.orchestrator.js";

export type KnowledgeBitPipelinePass = { name: string; run: () => Promise<unknown> };

export type KnowledgeBitPipelineStage = readonly KnowledgeBitPipelinePass[];

// Stages run in order; the passes inside one stage run concurrently and a stage ends when all of them settle.
export const KNOWLEDGE_BIT_PIPELINE_STAGES: readonly KnowledgeBitPipelineStage[] = [
  [{ name: "source_items", run: () => detectKnowledgeBits() }],
];

export function createKnowledgeBitPipelineKick(
  stages: readonly KnowledgeBitPipelineStage[],
): () => Promise<void> {
  let current: Promise<void> | null = null;
  let followUpQueued = false;

  async function runOnce(): Promise<void> {
    const summary: Record<string, unknown> = {};

    for (const stage of stages) {
      await Promise.all(
        stage.map(async (pass) => {
          try {
            summary[pass.name] = await pass.run();
          } catch (err) {
            summary[pass.name] = "failed";
            log.error({ err, pass: pass.name }, "knowledge_bit_pipeline_kick_pass_failed");
          }
        }),
      );
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

export const kickKnowledgeBitPipeline = createKnowledgeBitPipelineKick(
  KNOWLEDGE_BIT_PIPELINE_STAGES,
);
