import type http from "node:http";
import { resolvePlacementSuggestionInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { detectKnowledgeBits } from "./detect-knowledge-bits.orchestrator.js";
import { embedKnowledgeBits } from "./knowledge-bit-embedding.orchestrator.js";
import { tagKnowledgeBits } from "./knowledge-bit-tagging.orchestrator.js";
import { placeKnowledgeBits } from "./knowledge-bit-placement.orchestrator.js";
import {
  listPendingPlacementSuggestions,
  resolvePlacementSuggestion,
  type ResolvePlacementSuggestionResult,
} from "./knowledge-bit-placement.repo.js";

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

// A failure here is a real 502 — never a silent "nothing needed tagging".
export async function handleTriggerKnowledgeBitTaggingScan(
  res: http.ServerResponse,
): Promise<void> {
  try {
    const result = await tagKnowledgeBits();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_bit_tagging_scan_failed");

    const message = err instanceof Error ? err.message : "knowledge bit tagging scan failed";

    sendError(res, 502, "scan_failed", message);
  }
}

// A failure here is a real 502 — never a silent "nothing needed placing".
export async function handleTriggerKnowledgeBitPlacementScan(
  res: http.ServerResponse,
): Promise<void> {
  try {
    const result = await placeKnowledgeBits();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_bit_placement_scan_failed");

    const message = err instanceof Error ? err.message : "knowledge bit placement scan failed";

    sendError(res, 502, "scan_failed", message);
  }
}

// GET /knowledge-bits/placement-suggestions
export async function handleListPendingPlacementSuggestions(
  res: http.ServerResponse,
): Promise<void> {
  const suggestions = await listPendingPlacementSuggestions(200);

  sendJson(res, 200, suggestions);
}

// A suggestion that is no longer pending is a 409, not a 404 — mirrors
// handleResolveDomainTopicSuggestion's "already handled" distinction.
function sendResolvePlacementSuggestionError(
  res: http.ServerResponse,
  error: Extract<ResolvePlacementSuggestionResult, { error: string }>["error"],
): void {
  if (error === "invalid_input") {
    sendError(res, 400, error);
    return;
  }

  if (error === "not_found" || error === "module_not_found") {
    sendError(res, 404, error);
    return;
  }

  sendError(res, 409, "already_resolved");
}

// PATCH /knowledge-bits/:id/placement-suggestion
export async function handleResolvePlacementSuggestion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bitId: string,
): Promise<void> {
  const body = await readJsonBody(req, resolvePlacementSuggestionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await resolvePlacementSuggestion(
    bitId,
    body.data.status,
    body.data.status === "accepted" ? body.data.moduleId : undefined,
    body.data.status === "accepted" ? body.data.title : undefined,
  );

  if ("error" in result) {
    sendResolvePlacementSuggestionError(res, result.error);
    return;
  }

  sendJson(res, 200, result);
}
