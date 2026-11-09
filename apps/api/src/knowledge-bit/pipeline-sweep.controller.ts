import type http from "node:http";
import { sendBadGateway, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { runPipelineSweep } from "./pipeline-sweep.orchestrator.js";

export async function handleSweepKnowledgePipeline(res: http.ServerResponse): Promise<void> {
  try {
    const result = await runPipelineSweep();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_pipeline_sweep_failed");

    sendBadGateway(res, "sweep_failed");
  }
}
