import type http from "node:http";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { meAgentTodoInput, sendMeAgentTodo } from "./me-agent.client.js";

export async function handleCreateMeAgentTodo(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, meAgentTodoInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await sendMeAgentTodo(body.data);

  if (result.ok) {
    sendJson(res, 201, { sent: true });
    return;
  }

  if (result.reason === "not_configured") {
    sendError(res, 503, "me_agent_not_configured", "The Me agent is not configured.");
    return;
  }

  sendError(res, 502, "me_agent_failed", "The Me agent could not be reached. Try again shortly.");
}
