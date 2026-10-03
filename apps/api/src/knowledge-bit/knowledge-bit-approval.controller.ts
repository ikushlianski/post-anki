import type http from "node:http";
import { editKnowledgeBitQuestionVariantInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  approveKnowledgeBit,
  editKnowledgeBitQuestionVariant,
  listPendingKnowledgeBitsForReview,
  rejectKnowledgeBit,
} from "./knowledge-bit-approval.repo.js";

const PENDING_REVIEW_LIST_LIMIT = 200;

// GET /knowledge-bits/pending-review
export async function handleListPendingKnowledgeBitsForReview(
  res: http.ServerResponse,
): Promise<void> {
  const sources = await listPendingKnowledgeBitsForReview(PENDING_REVIEW_LIST_LIMIT);

  sendJson(res, 200, sources);
}

// POST /knowledge-bits/:id/approve
export async function handleApproveKnowledgeBit(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const approved = await approveKnowledgeBit(id);

  if (!approved) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { ok: true });
}

// POST /knowledge-bits/:id/reject
export async function handleRejectKnowledgeBit(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const rejected = await rejectKnowledgeBit(id);

  if (!rejected) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { ok: true });
}

// PATCH /knowledge-bits/question-variants/:id
export async function handleEditKnowledgeBitQuestionVariant(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  variantId: string,
): Promise<void> {
  const body = await readJsonBody(req, editKnowledgeBitQuestionVariantInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await editKnowledgeBitQuestionVariant(
    variantId,
    body.data.prompt,
    body.data.answer,
  );

  if ("error" in result) {
    sendError(res, 404, result.error);
    return;
  }

  sendJson(res, 200, result);
}
