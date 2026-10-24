import type http from "node:http";
import { regenerateKnowledgeSourceInput } from "@post-anki/shared";
import { generateItemsForSource } from "../knowledge-bit/detect-knowledge-bits.orchestrator.js";
import {
  isDurableExtractionEnabled,
  startDurableExtraction,
} from "../knowledge-bit/durable-extraction.starter.js";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import {
  claimSourceForRegeneration,
  getKnowledgeSourceRegenerationStatus,
} from "./knowledge-source-regeneration.repo.js";

const ERROR_STATUS = { not_found: 404, already_running: 409, source_text_missing: 422 } as const;

// POST /knowledge-sources/:id/regeneration
export async function handleRegenerateKnowledgeSource(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, regenerateKnowledgeSourceInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const claim = await claimSourceForRegeneration(id);

  if (!claim.ok) {
    sendError(res, ERROR_STATUS[claim.error], claim.error);
    return;
  }

  sendJson(res, 202, { status: "running", supersededCount: claim.supersededCount });

  if (isDurableExtractionEnabled()) {
    void startDurableExtraction([id], { regeneration: true })
      .then((result) => {
        if (result.fallbackIds.length > 0) {
          void generateItemsForSource(claim.source, { modelId: body.data.modelId }).catch((err) =>
            log.error({ err, knowledgeSourceId: id }, "knowledge_source_regeneration_failed"),
          );
        }
      })
      .catch((err) => {
        log.error({ err, knowledgeSourceId: id }, "durable_extraction_start_failed");
        void generateItemsForSource(claim.source, { modelId: body.data.modelId }).catch((genErr) =>
          log.error({ err: genErr, knowledgeSourceId: id }, "knowledge_source_regeneration_failed"),
        );
      });

    return;
  }

  void generateItemsForSource(claim.source, { modelId: body.data.modelId }).catch((err) =>
    log.error({ err, knowledgeSourceId: id }, "knowledge_source_regeneration_failed"),
  );
}

// GET /knowledge-sources/:id/regeneration
export async function handleGetKnowledgeSourceRegeneration(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const status = await getKnowledgeSourceRegenerationStatus(id);

  if (!status) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, status);
}
