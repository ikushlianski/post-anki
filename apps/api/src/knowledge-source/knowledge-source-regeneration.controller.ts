import type http from "node:http";
import { regenerateKnowledgeSourceInput } from "@post-anki/shared";
import { generateItemsForSource } from "../knowledge-bit/detect-knowledge-bits.orchestrator.js";
import {
  isDurableExtractionEnabled,
  startDurableExtraction,
} from "../knowledge-bit/durable-extraction.starter.js";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { dispatchBackground } from "../shared/background-dispatch.js";
import {
  claimSourceForRegeneration,
  getKnowledgeSourceRegenerationStatus,
} from "./knowledge-source-regeneration.repo.js";

const ERROR_STATUS = { not_found: 404, already_running: 409, source_text_missing: 422, not_nothing_extracted: 409 } as const;

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

  const claim = await claimSourceForRegeneration(id, {
    replacementText: body.data.text,
    ...(body.data.forceAtLeastOne === true ? { requireNothingExtracted: true } : {}),
  });

  if (!claim.ok) {
    sendError(res, ERROR_STATUS[claim.error], claim.error);
    return;
  }

  const forceAtLeastOne = body.data.forceAtLeastOne === true;
  const durable = isDurableExtractionEnabled();
  const modelId = body.data.modelId;
  const generateInProcess = () =>
    generateItemsForSource(claim.source, {
      modelId,
      ...(forceAtLeastOne ? { forceAtLeastOne } : {}),
    }).catch((err) =>
      log.error({ err, knowledgeSourceId: id }, "knowledge_source_regeneration_failed"),
    );

  await dispatchBackground({
    durable,
    start: async () => {
      if (!durable) {
        await generateInProcess();

        return;
      }

      try {
        await startDurableExtraction([id], {
          regeneration: true,
          extras: {
            ...(forceAtLeastOne ? { forceAtLeastOne } : {}),
            ...(modelId ? { modelId } : {}),
          },
        });
      } catch (err) {
        log.error({ err, knowledgeSourceId: id }, "durable_extraction_start_failed");
      }
    },
    onError: (err) => log.error({ err, knowledgeSourceId: id }, "knowledge_source_regeneration_failed"),
  });

  sendJson(res, 202, { status: "running", supersededCount: claim.supersededCount });
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
