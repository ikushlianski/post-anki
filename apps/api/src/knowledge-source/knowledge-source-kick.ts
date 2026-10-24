import { log } from "../shared/log.js";
import { dispatchBackground } from "../shared/background-dispatch.js";
import { startKnowledgeBitPipelineKick } from "../knowledge-bit/pipeline-kick.starter.js";
import {
  isDurableExtractionEnabled,
  startDurableExtraction,
} from "../knowledge-bit/durable-extraction.starter.js";

async function startDurableOrKick(sourceIds: string[]): Promise<void> {
  try {
    const result = await startDurableExtraction(sourceIds, { regeneration: false });

    if (result.fallbackIds.length === 0) {
      return;
    }
  } catch (err) {
    log.error({ err }, "durable_extraction_start_failed");
  }

  await startKnowledgeBitPipelineKick();
}

export function kickSourcesAfterAdd(sourceIds: string[]): Promise<void> {
  const durable = isDurableExtractionEnabled();

  return dispatchBackground({
    durable,
    start: () => (durable ? startDurableOrKick(sourceIds) : startKnowledgeBitPipelineKick()),
    onError: (err) => log.error({ err }, "knowledge_bit_pipeline_kick_failed"),
  });
}
