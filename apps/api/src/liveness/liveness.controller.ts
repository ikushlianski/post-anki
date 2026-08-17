import type http from "node:http";
import { nudgeResponseInputSchema } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { recordNudgeResponse } from "./liveness.repo.js";

export async function handleCreateNudgeResponse(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, nudgeResponseInputSchema);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await recordNudgeResponse(
    { entityType: body.data.entityType, entityId: body.data.entityId },
    body.data.response,
  );

  if ("error" in result) {
    sendError(res, 404, result.error);
    return;
  }

  sendJson(res, 201, result);
}
