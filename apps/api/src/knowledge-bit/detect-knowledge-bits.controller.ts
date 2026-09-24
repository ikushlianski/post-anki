import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { detectKnowledgeBits } from "./detect-knowledge-bits.orchestrator.js";
import { embedKnowledgeBits } from "./knowledge-bit-embedding.orchestrator.js";

// A failure here is a real 502 — never a silent "nothing needed detecting".
export async function handleDetectKnowledgeBits(res: http.ServerResponse): Promise<void> {
  try {
    const result = await detectKnowledgeBits();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_bit_detection_scan_failed");

    const message = err instanceof Error ? err.message : "knowledge bit detection scan failed";

    sendError(res, 502, "scan_failed", message);
  }
}

// A failure here is a real 502 — never a silent "nothing needed embedding".
export async function handleTriggerKnowledgeBitEmbeddingScan(
  res: http.ServerResponse,
): Promise<void> {
  try {
    const result = await embedKnowledgeBits();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_bit_embedding_scan_failed");

    const message = err instanceof Error ? err.message : "knowledge bit embedding scan failed";

    sendError(res, 502, "scan_failed", message);
  }
}
