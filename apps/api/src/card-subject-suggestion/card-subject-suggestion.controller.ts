import type http from "node:http";
import {
  cardSubjectSuggestionStatusSchema,
  resolveCardSubjectSuggestionInput,
} from "@post-anki/shared";
import { readJsonBody, sendBadGateway, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { runCardSubjectSuggestionScan } from "./card-subject-suggestion.orchestrator.js";
import { resolveCardSubjectSuggestion } from "./card-subject-suggestion-resolve.repo.js";
import { listCardSubjectSuggestions } from "./card-subject-suggestion.repo.js";

export async function handleTriggerCardSubjectSuggestionScan(res: http.ServerResponse): Promise<void> {
  try {
    sendJson(res, 200, await runCardSubjectSuggestionScan());
  } catch (err) {
    log.error({ err }, "card_subject_suggestion_scan_failed");

    sendBadGateway(res, "scan_failed");
  }
}

export async function handleListCardSubjectSuggestions(
  res: http.ServerResponse,
  statusParam: string | null,
): Promise<void> {
  const parsed = cardSubjectSuggestionStatusSchema.safeParse(statusParam ?? "pending");

  if (!parsed.success) {
    sendError(res, 400, "invalid_input", "invalid status filter");
    return;
  }

  sendJson(res, 200, await listCardSubjectSuggestions(parsed.data));
}

export async function handleResolveCardSubjectSuggestion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  suggestionId: string,
): Promise<void> {
  const body = await readJsonBody(req, resolveCardSubjectSuggestionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await resolveCardSubjectSuggestion(suggestionId, body.data);

  if ("error" in result) {
    sendError(res, result.error === "not_found" ? 404 : result.error === "subject_not_found" ? 400 : 409, result.error);
    return;
  }

  sendJson(res, 200, result);
}
