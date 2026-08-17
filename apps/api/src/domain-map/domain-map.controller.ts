import type http from "node:http";
import {
  domainPrioritySuggestionStatusSchema,
  domainSuggestionStatusSchema,
  mergeDomainNodesInput,
  resolveDomainPrioritySuggestionInput,
  updateDomainNodeInput,
  updateDomainSupersessionSuggestionInput,
  updateDomainTopicSuggestionInput,
} from "@post-anki/shared";
import { isDomainPriorityReviewDue } from "@post-anki/core";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import {
  getDomainMapForSubject,
  getDomainNode,
  getLastReviewedAt,
  listDomainSupersessionSuggestions,
  listDomainTopicSuggestions,
  listPrioritySuggestionsForSubject,
  mergeDomainNodes,
  resolveDomainSupersessionSuggestion,
  resolveDomainTopicSuggestion,
  resolvePrioritySuggestion,
  updateDomainNodeTargetDepth,
  type ResolveDomainTopicSuggestionError,
} from "./domain-map.repo.js";
import { triggerDomainPriorityReview } from "./domain-priority-review.orchestrator.js";
import { runDocScan, runDocScanForAllTrackedSubjects } from "./doc-scan.orchestrator.js";

export async function handleGetDomainMap(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  const tree = await getDomainMapForSubject(subjectId);

  sendJson(res, 200, tree);
}

// PATCH /domain-nodes/:id — sets or clears a node's target depth directly,
// independent of the review flow (spec.md "Setting target depth directly").
export async function handleUpdateDomainNode(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  nodeId: string,
): Promise<void> {
  const body = await readJsonBody(req, updateDomainNodeInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const existing = await getDomainNode(nodeId);

  if (!existing) {
    sendError(res, 404, "not_found");
    return;
  }

  const updated = await updateDomainNodeTargetDepth(nodeId, body.data.targetDepth);

  sendJson(res, 200, updated);
}

// POST /domain-nodes/:targetId/merge — issue #61. Absorbs sourceDomainNodeId
// into targetId; refuses cleanly on a cycle (target already inside source's
// own subtree) rather than corrupting the tree. See
// apps/api/src/domain-map/domain-map.repo.ts's mergeDomainNodes for the full
// procedure.
export async function handleMergeDomainNodes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetId: string,
): Promise<void> {
  const body = await readJsonBody(req, mergeDomainNodesInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await mergeDomainNodes(targetId, body.data.sourceDomainNodeId);

  if ("error" in result) {
    if (result.error === "not_found") {
      sendError(res, 404, "not_found");
      return;
    }

    sendJson(res, 400, { error: result.error });
    return;
  }

  sendJson(res, 200, result);
}

// POST /subjects/:id/domain-priority-reviews — the manual review trigger.
// Deliberately NOT the same silent-fallback shape as domain-placement's
// agent call (spec.md's Decisions #10): this is an explicit, foreground,
// user-waited-on action, so any orchestrator failure surfaces as a real
// 502, never a silent empty-array no-op. SCENARIO 8.
export async function handleTriggerDomainPriorityReview(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  try {
    const suggestions = await triggerDomainPriorityReview(subjectId);

    sendJson(res, 200, suggestions);
  } catch (err) {
    log.error({ err, subjectId }, "domain_priority_review_failed");

    const message = err instanceof Error ? err.message : "domain priority review failed";

    sendError(res, 502, "review_failed", message);
  }
}

// GET /subjects/:id/domain-priority-suggestions?status=pending
export async function handleListPrioritySuggestions(
  res: http.ServerResponse,
  subjectId: string,
  statusParam: string | null,
): Promise<void> {
  const parsedStatus = statusParam
    ? domainPrioritySuggestionStatusSchema.safeParse(statusParam)
    : undefined;

  if (statusParam && parsedStatus && !parsedStatus.success) {
    sendJson(res, 400, { error: "invalid_input", message: "invalid status filter" });
    return;
  }

  const suggestions = await listPrioritySuggestionsForSubject(
    subjectId,
    parsedStatus && parsedStatus.success ? parsedStatus.data : undefined,
  );

  sendJson(res, 200, suggestions);
}

// PATCH /domain-priority-suggestions/:id — accept writes the node's target
// depth in the same transaction; reject only resolves the suggestion,
// leaving the node untouched. Both are persisted, never deleted
// (spec.md's Decisions #11). SCENARIOS 6, 7. Claimed first the same way as
// the topic/supersession resolvers, so a double-click answers 409
// already_resolved instead of silently re-applying.
export async function handleResolvePrioritySuggestion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  suggestionId: string,
): Promise<void> {
  const body = await readJsonBody(req, resolveDomainPrioritySuggestionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const updated = await resolvePrioritySuggestion(suggestionId, body.data.status);

  if ("error" in updated) {
    sendResolveSuggestionError(res, updated.error);
    return;
  }

  sendJson(res, 200, updated);
}

// GET /subjects/:id/domain-priority-review-status — SCENARIO 9. Computed
// server-side from the same getLastReviewedAt() the review trigger itself
// updates by inserting new rows, so the "review due" banner and the
// mechanism that clears it share one source of truth.
export async function handleGetDomainPriorityReviewStatus(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  const lastReviewedAt = await getLastReviewedAt(subjectId);
  const due = isDomainPriorityReviewDue(lastReviewedAt, new Date());

  sendJson(res, 200, { lastReviewedAt, due });
}

// doc-changelog-scan (issue #49) — handlers below.

// POST /subjects/:id/doc-scans — the manual "Scan now" trigger + the
// e2e-testability path. Requires the subject to already have domain_nodes
// rows (404 otherwise — same gating precedent as the priority-review
// trigger). Deliberately always 200, even on an internal agent failure
// (spec.md's Decisions #8) — runDocScan() itself never throws; this is a
// scheduled-background-job-shaped mechanism, not a foreground one.
export async function handleTriggerDocScan(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  const tree = await getDomainMapForSubject(subjectId);

  if (tree.length === 0) {
    sendError(res, 404, "not_found");
    return;
  }

  const result = await runDocScan(subjectId);

  sendJson(res, 200, result);
}

// POST /doc-scans — the scheduled job's target, no subject in the path
// (Pulumi has no dynamically-generated subject id at deploy time). Always
// 200.
export async function handleTriggerAllDocScans(res: http.ServerResponse): Promise<void> {
  const results = await runDocScanForAllTrackedSubjects();

  sendJson(res, 200, results);
}

// GET /subjects/:id/doc-scan-suggestions?status=pending
export async function handleListDocScanSuggestions(
  res: http.ServerResponse,
  subjectId: string,
  statusParam: string | null,
): Promise<void> {
  const parsedStatus = statusParam ? domainSuggestionStatusSchema.safeParse(statusParam) : undefined;

  if (statusParam && parsedStatus && !parsedStatus.success) {
    sendJson(res, 400, { error: "invalid_input", message: "invalid status filter" });
    return;
  }

  const status = parsedStatus && parsedStatus.success ? parsedStatus.data : undefined;

  const [newTopics, supersessions] = await Promise.all([
    listDomainTopicSuggestions(subjectId, status),
    listDomainSupersessionSuggestions(subjectId, status),
  ]);

  sendJson(res, 200, { newTopics, supersessions });
}

// A suggestion that is no longer pending is a 409, not a 404: the row is
// there and already handled, which is exactly what a double-click's second
// PATCH hits. Distinguishing the two is what lets the review panel tell
// "someone else already resolved this" apart from "this id is wrong".
// subject_not_found is a 404 too: the accept could not create its node
// because the owning subject was merged or deleted out from under the
// pending suggestion, so from the caller's side the thing it addressed is
// gone. The suggestion is left pending in that case, never half-accepted.
function sendResolveSuggestionError(
  res: http.ServerResponse,
  error: ResolveDomainTopicSuggestionError,
): void {
  if (error === "not_found" || error === "subject_not_found") {
    sendError(res, 404, error);
    return;
  }

  sendError(res, 409, "already_resolved");
}

// PATCH /domain-topic-suggestions/:id
export async function handleResolveDomainTopicSuggestion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  suggestionId: string,
): Promise<void> {
  const body = await readJsonBody(req, updateDomainTopicSuggestionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const updated = await resolveDomainTopicSuggestion(suggestionId, body.data.status);

  if ("error" in updated) {
    sendResolveSuggestionError(res, updated.error);
    return;
  }

  sendJson(res, 200, updated);
}

// PATCH /domain-supersession-suggestions/:id
export async function handleResolveDomainSupersessionSuggestion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  suggestionId: string,
): Promise<void> {
  const body = await readJsonBody(req, updateDomainSupersessionSuggestionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const updated = await resolveDomainSupersessionSuggestion(suggestionId, body.data.status);

  if ("error" in updated) {
    sendResolveSuggestionError(res, updated.error);
    return;
  }

  sendJson(res, 200, updated);
}
