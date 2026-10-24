import { createInngestClient } from "../shared/inngest-client.js";
import { isDurableExtractionEnabled } from "./durable-extraction.flag.js";
import { kickKnowledgeBitPipeline } from "./knowledge-bit-pipeline-kick.orchestrator.js";

export interface PipelineKickStarterDeps {
  isDurable: () => boolean;
  sendEvent: () => Promise<void>;
  kickInProcess: () => Promise<void>;
}

function defaultDeps(): PipelineKickStarterDeps {
  return {
    isDurable: () => isDurableExtractionEnabled(),
    sendEvent: async () => {
      await createInngestClient().send({
        name: "knowledge-bit/pipeline-kick.requested",
        data: { requestedAt: Date.now() },
      });
    },
    kickInProcess: kickKnowledgeBitPipeline,
  };
}

export async function startKnowledgeBitPipelineKick(
  deps: PipelineKickStarterDeps = defaultDeps(),
): Promise<void> {
  if (!deps.isDurable()) {
    return deps.kickInProcess();
  }

  try {
    await deps.sendEvent();
  } catch {
    await deps.kickInProcess();
  }
}
