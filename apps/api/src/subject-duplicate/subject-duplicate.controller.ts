import type http from "node:http";
import {
  resolveSubjectDuplicateSuggestionInput,
  subjectDuplicateSuggestionStatusSchema,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { triggerSubjectDuplicateScan } from "./subject-duplicate.orchestrator.js";
import {
  listSubjectDuplicateSuggestions,
  resolveSubjectDuplicateSuggestion,
} from "./subject-duplicate.repo.js";

// POST /subject-duplicate-scans. Deliberately no silent-fallback posture
// (mirrors handleTriggerDomainPriorityReview) — an embedding-call failure
// after the bounded retry budget propagates as a 502 with a clear message,
// never a false "no duplicates found" (SCENARIO 6).
export async function handleTriggerSubjectDuplicateScan(
  res: http.ServerResponse,
): Promise<void> {
  try {
    const result = await triggerSubjectDuplicateScan();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "subject_duplicate_scan_failed");

    const message = err instanceof Error ? err.message : "subject duplicate scan failed";

    sendError(res, 502, "scan_failed", message);
  }
}

// GET /subject-duplicate-suggestions?status=pending
export async function handleListSubjectDuplicateSuggestions(
  res: http.ServerResponse,
  statusParam: string | null,
): Promise<void> {
  const parsedStatus = statusParam
    ? subjectDuplicateSuggestionStatusSchema.safeParse(statusParam)
    : undefined;

  if (statusParam && parsedStatus && !parsedStatus.success) {
    sendJson(res, 400, { error: "invalid_input", message: "invalid status filter" });
    return;
  }

  const suggestions = await listSubjectDuplicateSuggestions(
    parsedStatus && parsedStatus.success ? parsedStatus.data : undefined,
  );

  sendJson(res, 200, suggestions);
}

// PATCH /subject-duplicate-suggestions/:id. Decision #11: a targetSubjectId
// that isn't one of the suggestion's own pair is rejected with a 400 before
// any merge is attempted — the repo validates this (returns "invalid_target")
// rather than the controller doing a redundant second lookup, but the
// behavioral guarantee (never merges against an unrelated third subject) is
// the same either way. Decision #14: an already-resolved row returns 409,
// not a silently-repeated status flip.
export async function handleResolveSubjectDuplicateSuggestion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  suggestionId: string,
): Promise<void> {
  const body = await readJsonBody(req, resolveSubjectDuplicateSuggestionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await resolveSubjectDuplicateSuggestion(suggestionId, body.data);

  if ("error" in result) {
    switch (result.error) {
      case "not_found":
        sendError(res, 404, "not_found");
        return;
      case "already_resolved":
        sendError(res, 409, "already_resolved");
        return;
      case "invalid_target":
        sendJson(res, 400, { error: "invalid_target" });
        return;
      default:
        // self_merge / kind_mismatch — MergeSubjectsError cases that
        // shouldn't arise for a scan-produced suggestion (the two ids are
        // always distinct, both architecture-mentor) but handled
        // defensively rather than assumed unreachable.
        sendJson(res, 400, { error: result.error });
        return;
    }
  }

  sendJson(res, 200, result);
}
