import type http from "node:http";
import { recordReviewInputSchema, reviewCardsQuerySchema } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { getKnowledgeBitReviewQueue } from "./knowledge-bit-review-queue.repo.js";
import { recordKnowledgeBitReview } from "./knowledge-bit-review.orchestrator.js";

export async function handleListKnowledgeBitReviewCards(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const parsed = reviewCardsQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    sendJson(res, 400, { error: "invalid_input", message: parsed.error.issues });
    return;
  }

  const { limit, tz, tagId, topicId, knowledgeBitId } = parsed.data;
  const queue = await getKnowledgeBitReviewQueue(
    limit,
    { tagId, topicId, knowledgeBitId },
    { tz, now: new Date() },
  );

  sendJson(res, 200, queue);
}

export async function handleRecordKnowledgeBitReview(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, recordReviewInputSchema);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const outcome = await recordKnowledgeBitReview(body.data);

  if (!outcome.ok) {
    log.warn({ variantId: body.data.variantId, error: outcome.error }, "knowledge_bit_review_refused");
    sendError(res, outcome.error === "not_approved" ? 403 : 404, outcome.error);
    return;
  }

  const { ok: _ok, ...result } = outcome;

  sendJson(res, 201, result);
}
