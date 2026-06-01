import type http from "node:http";
import { startProbeInput, submitProbeInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { startProbe, submitProbe, type ProbeError } from "./probe.service.js";

const STATUS: Record<ProbeError, number> = {
  not_found: 404,
  not_confirmed: 409,
  gap_not_open: 409,
};

export async function handleStartProbe(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const body = await readJsonBody(req, startProbeInput.omit({ topicId: true }));

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await startProbe({ ...body.data, topicId });

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}

export async function handleSubmitProbe(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const body = await readJsonBody(req, submitProbeInput.omit({ topicId: true }));

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await submitProbe({ ...body.data, topicId }, new Date().toISOString());

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}
