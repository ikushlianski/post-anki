import type http from "node:http";
import {
  recordKnownReviewInputSchema,
  recordReviewInputSchema,
  reviewCardsQuerySchema,
  reviewPackQuerySchema,
  scheduleControlInputSchema,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson, sendInvalidQuery } from "../shared/http.js";
import { log } from "../shared/log.js";
import { recordActivityToday } from "../streak/streak.service.js";
import { loadSubjectPathLabels } from "../subject/subject-path-labels.js";
import { groupReviewCardsBySubject } from "./knowledge-bit-review-subject-groups.js";
import { getKnowledgeBitReviewQueue } from "./knowledge-bit-review-queue.repo.js";
import { buildReviewPack } from "./knowledge-bit-review-pack.service.js";
import { attachUserNotes } from "./knowledge-bit-user-note.repo.js";
import { resolveReviewedAt } from "./knowledge-bit-review-time.js";
import { recordKnowledgeBitReview } from "./knowledge-bit-review.orchestrator.js";
import { recordKnownKnowledgeBitReview } from "./knowledge-bit-review-known.orchestrator.js";
import { updateKnowledgeBitScheduleControls } from "./knowledge-bit-review-suspension.orchestrator.js";
import { undoKnowledgeBitReview } from "./knowledge-bit-review-undo.orchestrator.js";

export async function handleListKnowledgeBitReviewCards(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const parsed = reviewCardsQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    sendInvalidQuery(res, parsed.error);
    return;
  }

  const { limit, tz, tagId, topicId, knowledgeBitId, subjectId, aheadDays, newCards, shuffleSeed } = parsed.data;
  const queue = await getKnowledgeBitReviewQueue(
    limit,
    { tagId, topicId, knowledgeBitId, subjectId },
    { tz, now: new Date(), aheadDays, excludeNew: newCards === "exclude", shuffleSeed },
  );

  const labels = await loadSubjectPathLabels();

  const cards = await attachUserNotes(groupReviewCardsBySubject(queue.cards, labels));

  sendJson(res, 200, { ...queue, cards });
}

export async function handleGetReviewPack(res: http.ServerResponse, search: string): Promise<void> {
  const parsed = reviewPackQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    sendInvalidQuery(res, parsed.error);
    return;
  }

  const pack = await buildReviewPack(parsed.data.tz, new Date());
  const labels = await loadSubjectPathLabels();
  const labelOf = (subjectId: string | null): string | null => (subjectId ? (labels.get(subjectId) ?? null) : null);
  const cards = await attachUserNotes(pack.cards);
  const alternates = await attachUserNotes(cards.flatMap((card) => card.alternates));
  const noteByBit = new Map(alternates.map((alt) => [alt.knowledgeBitId, alt.userNote]));

  sendJson(res, 200, {
    ...pack,
    cards: cards.map((card) => ({
      ...card,
      subjectPath: labelOf(card.subjectId),
      alternates: card.alternates.map((alt) => ({
        ...alt,
        subjectPath: labelOf(alt.subjectId),
        userNote: noteByBit.get(alt.knowledgeBitId) ?? null,
      })),
    })),
  });
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

  const reviewTime = resolveReviewedAt(body.data, new Date());

  if (!reviewTime.ok) {
    sendJson(res, 400, { error: reviewTime.error });
    return;
  }

  const outcome = await recordKnowledgeBitReview(body.data, reviewTime.reviewedAt);

  if (!outcome.ok) {
    log.warn({ variantId: body.data.variantId, error: outcome.error }, "knowledge_bit_review_refused");
    sendError(res, outcome.error === "not_approved" ? 403 : 404, outcome.error);
    return;
  }

  const { ok: _ok, ...result } = outcome;

  if (!result.superseded) {
    try {
      await recordActivityToday(reviewTime.reviewedAt.toISOString(), "review");
    } catch (error) {
      log.warn({ error }, "record_activity_after_review_failed");
    }
  }

  sendJson(res, 201, result);
}

export async function handleRecordKnownKnowledgeBitReview(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, recordKnownReviewInputSchema);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const now = new Date();
  const outcome = await recordKnownKnowledgeBitReview(body.data, now);

  if (!outcome.ok) {
    sendError(res, outcome.error === "not_approved" ? 403 : 404, outcome.error);
    return;
  }

  const { ok: _ok, ...result } = outcome;

  try {
    await recordActivityToday(now.toISOString(), "review");
  } catch (error) {
    log.warn({ error }, "record_activity_after_known_review_failed");
  }

  sendJson(res, 201, result);
}

export async function handleUndoKnowledgeBitReview(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const outcome = await undoKnowledgeBitReview(id);

  if (!outcome.ok) {
    sendError(res, outcome.error === "not_latest" ? 409 : 404, outcome.error);
    return;
  }

  const { ok: _ok, ...result } = outcome;

  sendJson(res, 200, result);
}

export async function handleUpdateKnowledgeBitScheduleControls(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, scheduleControlInputSchema);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const outcome = await updateKnowledgeBitScheduleControls(id, body.data);

  if (!outcome.ok) {
    sendError(res, outcome.error === "not_approved" ? 403 : 404, outcome.error);
    return;
  }

  const { ok: _ok, ...result } = outcome;

  sendJson(res, 200, result);
}
