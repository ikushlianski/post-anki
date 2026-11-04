import type http from "node:http";
import { putAddKnowledgeGoalInput, timeZoneQuery } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson, sendInvalidQuery } from "../shared/http.js";
import { listGoalProgress, listGoals, putGoal, removeGoal } from "./add-knowledge-goal.orchestrator.js";

export async function handleListAddKnowledgeGoals(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, { goals: await listGoals() });
}

export async function handlePutAddKnowledgeGoal(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, putAddKnowledgeGoalInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });

    return;
  }

  const goal = await putGoal(body.data);

  if (!goal) {
    sendError(res, 404, "subject_not_found");

    return;
  }

  sendJson(res, 200, goal);
}

export async function handleDeleteAddKnowledgeGoal(res: http.ServerResponse, id: string): Promise<void> {
  if (!(await removeGoal(id))) {
    sendError(res, 404, "add_knowledge_goal_not_found");

    return;
  }

  sendJson(res, 200, { deleted: true });
}

export async function handleListAddKnowledgeGoalProgress(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const query = timeZoneQuery.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!query.success) {
    sendInvalidQuery(res, query.error);

    return;
  }

  sendJson(res, 200, { goals: await listGoalProgress(query.data.tz, new Date()) });
}
