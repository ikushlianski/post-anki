import type http from "node:http";
import { triageKnowledgeBitInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { triageKnowledgeBit } from "./knowledge-bit-triage.repo.js";

// POST /knowledge-bits/:id/triage
export async function handleTriageKnowledgeBit(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, triageKnowledgeBitInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await triageKnowledgeBit(id, body.data.keepVariantIds);

  if (result === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result === "blocked" || result === "no_variant" || result === "variant_not_active") {
    sendError(res, 409, result);
    return;
  }

  sendJson(res, 200, { ok: true, droppedVariantIds: result.droppedVariantIds });
}
