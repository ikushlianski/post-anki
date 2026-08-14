import type http from "node:http";
import { domainRecommendationStatusSchema, resolveDomainRecommendationInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  listRecommendationsForSubject,
} from "./domain-recommendation.repo.js";
import {
  resolveDomainRecommendation,
  triggerDomainRecommendations,
  type ResolveDomainRecommendationError,
} from "./domain-recommendation.orchestrator.js";

// POST /subjects/:id/domain-recommendations — mirrors
// handleTriggerDomainPriorityReview's shape, but this trigger has no agent
// call to fail on: its only two failure modes are gating conditions
// (empty tree / not taxonomy-backed), both mapped to a clean 404 rather than
// a 502 — there's no transient failure to retry here, the subject's tree
// shape just doesn't qualify.
export async function handleTriggerDomainRecommendations(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  const result = await triggerDomainRecommendations(subjectId);

  if ("error" in result) {
    sendError(res, 404, result.error);
    return;
  }

  sendJson(res, 200, result);
}

// GET /subjects/:id/domain-recommendations?status=pending
export async function handleListDomainRecommendations(
  res: http.ServerResponse,
  subjectId: string,
  statusParam: string | null,
): Promise<void> {
  const parsedStatus = statusParam ? domainRecommendationStatusSchema.safeParse(statusParam) : undefined;

  if (statusParam && parsedStatus && !parsedStatus.success) {
    sendJson(res, 400, { error: "invalid_input", message: "invalid status filter" });
    return;
  }

  const recommendations = await listRecommendationsForSubject(
    subjectId,
    parsedStatus && parsedStatus.success ? parsedStatus.data : undefined,
  );

  sendJson(res, 200, recommendations);
}

// A recommendation that is no longer pending is a 409, not a 404 — the row
// is there and already handled, exactly what a double-click's second PATCH
// hits (mirrors sendResolveSuggestionError, domain-map.controller.ts).
// subject_not_found is a 404: the accept could not create its curriculum
// because the owning subject was deleted out from under the pending
// recommendation, so from the caller's side the thing it addressed is gone.
// The recommendation is released back to pending in that case, never left
// half-accepted.
function sendResolveError(res: http.ServerResponse, error: ResolveDomainRecommendationError): void {
  if (error === "not_found" || error === "subject_not_found") {
    sendError(res, 404, error);
    return;
  }

  sendError(res, 409, "already_resolved");
}

// PATCH /domain-recommendations/:id
export async function handleResolveDomainRecommendation(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  recommendationId: string,
): Promise<void> {
  const body = await readJsonBody(req, resolveDomainRecommendationInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const updated = await resolveDomainRecommendation(recommendationId, body.data.status);

  if ("error" in updated) {
    sendResolveError(res, updated.error);
    return;
  }

  sendJson(res, 200, updated);
}
