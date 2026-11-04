import type http from "node:http";
import {
  CLOZE_ERROR_MESSAGES,
  ORDERED_LIST_ERROR_MESSAGES,
  editKnowledgeBitQuestionVariantInput,
  pendingReviewCursorSchema,
} from "@post-anki/shared";
import { z } from "zod";
import { readJsonBody, sendError, sendInvalidQuery, sendJson } from "../shared/http.js";
import { embedApprovedKnowledgeBits } from "./knowledge-bit-approval-embedding.orchestrator.js";
import {
  approveKnowledgeBit,
  editKnowledgeBitQuestionVariant,
  listPendingKnowledgeBitsForReview,
  rejectKnowledgeBit,
} from "./knowledge-bit-approval.repo.js";
import { listPendingReviewSubjectCounts } from "./knowledge-bit-pending-subjects.repo.js";
import { countPendingKnowledgeBitsForReview } from "./knowledge-bit-pending-total.repo.js";
import { editKnowledgeBitOrderedList } from "./knowledge-bit-list-edit.repo.js";
import { editKnowledgeBitClozeNote } from "./knowledge-bit-note-edit.repo.js";
import { listSourcesNeedingAttention } from "./knowledge-source-attention.repo.js";
import { mergeAttentionIntoSources } from "./knowledge-source-attention.merge.js";

const PENDING_REVIEW_LIST_LIMIT = 200;

const pendingReviewLimitSchema = z.coerce.number().int().min(1).max(PENDING_REVIEW_LIST_LIMIT);

// GET /knowledge-bits/pending-review
export async function handleListPendingKnowledgeBitsForReview(
  res: http.ServerResponse,
  search: string = "",
): Promise<void> {
  const params = new URLSearchParams(search);
  const subjectId = params.get("subjectId")?.trim() || undefined;
  const rawLimit = params.get("limit");
  const limit = pendingReviewLimitSchema.safeParse(rawLimit ?? PENDING_REVIEW_LIST_LIMIT);

  if (!limit.success) {
    sendInvalidQuery(res, limit.error);
    return;
  }

  const parsedCursor = pendingReviewCursorSchema.safeParse({
    afterCreatedAt: params.get("afterCreatedAt") ?? undefined,
    afterId: params.get("afterId") ?? undefined,
  });

  if (!parsedCursor.success) {
    sendInvalidQuery(res, parsedCursor.error);
    return;
  }

  const { afterCreatedAt, afterId } = parsedCursor.data;
  const cursor = afterCreatedAt && afterId ? { afterCreatedAt, afterId } : undefined;
  const withTotal = params.get("includeTotal") === "1";
  const [sources, total] = await Promise.all([
    listPendingKnowledgeBitsForReview(limit.data, undefined, subjectId, cursor),
    withTotal ? countPendingKnowledgeBitsForReview(subjectId) : Promise.resolve(undefined),
  ]);
  const items =
    params.get("attention") === "1"
      ? mergeAttentionIntoSources(sources, await listSourcesNeedingAttention())
      : sources;

  sendJson(res, 200, total === undefined ? items : { items, total });
}

// GET /knowledge-bits/pending-review/subjects
export async function handleListPendingReviewSubjects(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await listPendingReviewSubjectCounts());
}

// POST /knowledge-bits/:id/approve
export async function handleApproveKnowledgeBit(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const result = await approveKnowledgeBit(id);

  if (result === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result === "blocked" || result === "no_variant") {
    sendError(res, 409, result);
    return;
  }

  await embedApprovedKnowledgeBits([id]);

  sendJson(res, 200, { ok: true });
}

// POST /knowledge-bits/:id/reject
export async function handleRejectKnowledgeBit(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const rejected = await rejectKnowledgeBit(id);

  if (!rejected.ok) {
    const status = rejected.reason === "blocked" ? 409 : 404;

    sendError(res, status, rejected.reason);
    return;
  }

  sendJson(res, 200, { ok: true, feedbackId: rejected.feedbackId });
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

  if ("note" in body.data) {
    await handleEditClozeNote(res, variantId, body.data.note);
    return;
  }

  if ("list" in body.data) {
    await handleEditOrderedList(res, variantId, body.data.list);
    return;
  }

  const result = await editKnowledgeBitQuestionVariant(
    variantId,
    body.data.prompt,
    body.data.answer,
    body.data.context,
  );

  if ("error" in result) {
    const status = result.error === "blocked" ? 409 : result.error === "wrong_shape" ? 400 : 404;

    sendError(res, status, result.error);
    return;
  }

  await embedApprovedKnowledgeBits([result.knowledgeBitId]);

  sendJson(res, 200, { ok: true, variantId: result.variantId });
}

async function handleEditClozeNote(res: http.ServerResponse, variantId: string, note: string): Promise<void> {
  const result = await editKnowledgeBitClozeNote(variantId, note);

  if ("error" in result) {
    if (result.error === "invalid_note") {
      sendJson(res, 400, {
        error: "invalid_note",
        reason: result.reason,
        message: CLOZE_ERROR_MESSAGES[result.reason],
      });
      return;
    }

    sendError(res, result.error === "blocked" ? 409 : result.error === "wrong_shape" ? 400 : 404, result.error);
    return;
  }

  await embedApprovedKnowledgeBits([result.knowledgeBitId]);

  sendJson(res, 200, {
    ok: true,
    variantId: result.variantId,
    cards: result.cards,
  });
}

async function handleEditOrderedList(res: http.ServerResponse, variantId: string, list: string): Promise<void> {
  const result = await editKnowledgeBitOrderedList(variantId, list);

  if ("error" in result) {
    if (result.error === "invalid_list") {
      sendJson(res, 400, {
        error: "invalid_list",
        reason: result.reason,
        message: ORDERED_LIST_ERROR_MESSAGES[result.reason],
      });
      return;
    }

    sendError(res, result.error === "blocked" ? 409 : result.error === "wrong_shape" ? 400 : 404, result.error);
    return;
  }

  await embedApprovedKnowledgeBits([result.knowledgeBitId]);

  sendJson(res, 200, { ok: true, variantId: result.variantId, cards: result.cards });
}
