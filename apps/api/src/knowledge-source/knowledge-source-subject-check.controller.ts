import type http from "node:http";
import { subjectCheckRequestSchema } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { runSubjectCheck } from "./knowledge-source-subject-check.orchestrator.js";

export async function handleCreateKnowledgeSourceSubjectCheck(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, subjectCheckRequestSchema);

  if (!body.ok) {
    sendError(res, 400, "invalid_input", body.issues);
    return;
  }

  try {
    sendJson(res, 200, await runSubjectCheck(body.data));
  } catch (err) {
    log.error({ err }, "subject_check_failed");
    sendJson(res, 200, { status: "unavailable", reason: "failed" });
  }
}
