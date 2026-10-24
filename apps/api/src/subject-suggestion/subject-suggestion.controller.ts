import type http from "node:http";
import { resolveSubjectSuggestionInput, subjectSuggestionStatusSchema } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { runSubjectSuggestionScan } from "./subject-suggestion.orchestrator.js";
import { listSubjectSuggestions, resolveSubjectSuggestion } from "./subject-suggestion.repo.js";

export async function handleTriggerSubjectSuggestionScan(res: http.ServerResponse): Promise<void> {
  try {
    const result = await runSubjectSuggestionScan({ ignoreDailyCap: true });

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "subject_suggestion_scan_failed");

    const message = err instanceof Error ? err.message : "subject suggestion scan failed";

    sendError(res, 502, "scan_failed", message);
  }
}

export async function handleListSubjectSuggestions(
  res: http.ServerResponse,
  statusParam: string | null,
): Promise<void> {
  const parsed = statusParam ? subjectSuggestionStatusSchema.safeParse(statusParam) : undefined;

  if (parsed && !parsed.success) {
    sendError(res, 400, "invalid_input", "invalid status filter");
    return;
  }

  sendJson(res, 200, await listSubjectSuggestions(parsed?.data));
}

export async function handleResolveSubjectSuggestion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  suggestionId: string,
): Promise<void> {
  const body = await readJsonBody(req, resolveSubjectSuggestionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await resolveSubjectSuggestion(suggestionId, body.data);

  if ("error" in result) {
    switch (result.error) {
      case "not_found":
        sendError(res, 404, "not_found");
        return;
      case "already_resolved":
      case "name_taken":
        sendError(res, 409, result.error);
        return;
      default:
        sendError(res, 400, result.error);
        return;
    }
  }

  sendJson(res, 200, result);
}
