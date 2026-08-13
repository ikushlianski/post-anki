import type http from "node:http";
import {
  resolveSourceDuplicateSuggestionInput,
  sourceDuplicateSuggestionStatusSchema,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { triggerSourceDuplicateScan } from "./source-duplicate.orchestrator.js";
import {
  listSourceDuplicateSuggestions,
  resolveSourceDuplicateSuggestion,
} from "./source-duplicate.repo.js";

// POST /source-duplicate-scans. Deliberately no silent-fallback posture
// (mirrors handleTriggerSubjectDuplicateScan) — an embedding-call failure
// after the bounded retry budget propagates as a 502 with a clear message,
// never a false "no duplicates found".
export async function handleTriggerSourceDuplicateScan(res: http.ServerResponse): Promise<void> {
  try {
    const result = await triggerSourceDuplicateScan();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "source_duplicate_scan_failed");

    const message = err instanceof Error ? err.message : "source duplicate scan failed";

    sendError(res, 502, "scan_failed", message);
  }
}

// GET /source-duplicate-suggestions?status=pending
export async function handleListSourceDuplicateSuggestions(
  res: http.ServerResponse,
  statusParam: string | null,
): Promise<void> {
  const parsedStatus = statusParam
    ? sourceDuplicateSuggestionStatusSchema.safeParse(statusParam)
    : undefined;

  if (statusParam && parsedStatus && !parsedStatus.success) {
    sendJson(res, 400, { error: "invalid_input", message: "invalid status filter" });
    return;
  }

  const suggestions = await listSourceDuplicateSuggestions(
    parsedStatus && parsedStatus.success ? parsedStatus.data : undefined,
  );

  sendJson(res, 200, suggestions);
}

// PATCH /source-duplicate-suggestions/:id. SCENARIO 5: this only ever moves
// status/resolvedAt — the repo layer enforces "no merge, no delete" by
// construction (resolveSourceDuplicateSuggestion has no merge branch at
// all), and an already-resolved row returns 409 rather than silently
// re-flipping.
export async function handleResolveSourceDuplicateSuggestion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  suggestionId: string,
): Promise<void> {
  const body = await readJsonBody(req, resolveSourceDuplicateSuggestionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await resolveSourceDuplicateSuggestion(suggestionId, body.data);

  if ("error" in result) {
    switch (result.error) {
      case "not_found":
        sendError(res, 404, "not_found");
        return;
      case "already_resolved":
        sendError(res, 409, "already_resolved");
        return;
    }
  }

  sendJson(res, 200, result);
}
