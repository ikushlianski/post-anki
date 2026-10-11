import type http from "node:http";
import { setKnowledgeBitFeedbackReasonInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  aggregateFeedbackByModel,
  restoreRejectedKnowledgeBit,
  setKnowledgeBitFeedbackReason,
} from "./knowledge-bit-feedback.repo.js";

// PATCH /knowledge-bit-feedback/:id
export async function handleSetKnowledgeBitFeedbackReason(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, setKnowledgeBitFeedbackReasonInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const updated = await setKnowledgeBitFeedbackReason(id, body.data);

  if (!updated) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { ok: true });
}

// POST /knowledge-bits/:id/restore
export async function handleRestoreRejectedKnowledgeBit(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const restored = await restoreRejectedKnowledgeBit(id);

  if (!restored) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { ok: true });
}

// GET /admin/knowledge-bit-feedback/by-model
export async function handleGetKnowledgeBitFeedbackByModel(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await aggregateFeedbackByModel());
}
