import type http from "node:http";
import {
  isRejectReasonAllowedForSubjectType,
  patchTriageDecisionInput,
  triageHistoryQuery,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { resolveRejectSubjectType } from "../subject/reject-subject-type.js";
import { getRecentTriageHistory } from "./card-triage-history.orchestrator.js";
import { patchTriageDecisionDetails } from "./card-triage-decision-patch.repo.js";
import { toTriageDecisionResponse } from "./card-triage-decision.repo.js";
import { findTriageDecisionById } from "./card-triage-history.repo.js";

// GET /triage-decisions/recent
export async function handleListRecentTriageDecisions(res: http.ServerResponse, search: string): Promise<void> {
  const params = new URLSearchParams(search);
  const parsed = triageHistoryQuery.safeParse({
    ...(params.has("days") ? { days: params.get("days") } : {}),
    ...(params.has("q") ? { q: params.get("q") } : {}),
    ...(params.has("mode") ? { mode: params.get("mode") } : {}),
  });

  if (!parsed.success) {
    sendJson(res, 400, { error: "invalid_input", message: parsed.error.issues.map((issue) => issue.message).join("; ") });
    return;
  }

  sendJson(res, 200, await getRecentTriageHistory(parsed.data));
}

// PATCH /triage-decisions/:id
export async function handlePatchTriageDecision(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  decisionId: string,
): Promise<void> {
  const body = await readJsonBody(req, patchTriageDecisionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const existing = await findTriageDecisionById(decisionId);

  if (!existing) {
    sendError(res, 404, "not_found");
    return;
  }

  if (body.data.reasonCode && existing.verdict !== "rejected") {
    sendJson(res, 400, { error: "reason_requires_rejected" });
    return;
  }

  if (body.data.reasonCode) {
    const subjectType = await resolveRejectSubjectType(existing.subjectId);

    if (!isRejectReasonAllowedForSubjectType(subjectType, body.data.reasonCode)) {
      sendJson(res, 400, { error: "invalid_reason_for_subject_type", subjectType });
      return;
    }
  }

  const updated = await patchTriageDecisionDetails(decisionId, body.data);

  if (!updated) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, toTriageDecisionResponse(updated));
}
