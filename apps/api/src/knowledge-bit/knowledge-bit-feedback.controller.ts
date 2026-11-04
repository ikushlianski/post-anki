import type http from "node:http";
import {
  gradeKnowledgeBitInput,
  isRejectReasonAllowedForSubjectType,
  updateKnowledgeBitFeedbackInput,
} from "@post-anki/shared";
import { rejectSubjectTypeForFeedback } from "./reject-reason-subject-type.repo.js";
import { gradeKnowledgeBit } from "./knowledge-bit-grade.repo.js";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  aggregateFeedbackByModel,
  restoreRejectedKnowledgeBit,
  updateKnowledgeBitFeedback,
} from "./knowledge-bit-feedback.repo.js";

// PATCH /knowledge-bit-feedback/:id
export async function handleSetKnowledgeBitFeedbackReason(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, updateKnowledgeBitFeedbackInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  if (body.data.reasonCode !== undefined) {
    const subjectType = await rejectSubjectTypeForFeedback(id);

    if (subjectType && !isRejectReasonAllowedForSubjectType(subjectType, body.data.reasonCode)) {
      sendJson(res, 400, { error: "invalid_reason_for_subject_type", subjectType });
      return;
    }
  }

  const updated = await updateKnowledgeBitFeedback(id, body.data);

  if (!updated) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { ok: true });
}

// POST /knowledge-bits/:id/grades
export async function handleGradeKnowledgeBit(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, gradeKnowledgeBitInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await gradeKnowledgeBit(id, body.data);

  if (result.status === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result.status === "not_applicable") {
    sendError(res, 400, "grades_not_applicable");
    return;
  }

  sendJson(res, 200, { ok: true, feedbackId: result.feedbackId });
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
