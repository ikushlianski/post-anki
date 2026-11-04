import type http from "node:http";
import {
  createSubjectPriorityInput,
  currentPrioritiesQuery,
  listSubjectPrioritiesQuery,
  timeZoneQuery,
  updateSubjectPriorityInput,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson, sendInvalidQuery } from "../shared/http.js";
import {
  createSubjectPriority,
  listCurrentPriorities,
  listSubjectPriorities,
  removeSubjectPriority,
  updateSubjectPriority,
  type PriorityMutation,
} from "./subject-priority.orchestrator.js";

function queryOf(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search));
}

function sendMutation(res: http.ServerResponse, result: PriorityMutation, successStatus: number): void {
  if (result.ok) {
    sendJson(res, successStatus, result.priority);

    return;
  }

  if (result.error === "invalid_period_key") {
    sendJson(res, 400, { error: "invalid_input", message: "periodKey: no such period" });

    return;
  }

  sendError(res, 404, result.error);
}

export async function handleListSubjectPriorities(
  res: http.ServerResponse,
  subjectId: string,
  search: string,
): Promise<void> {
  const query = listSubjectPrioritiesQuery.safeParse(queryOf(search));

  if (!query.success) {
    sendInvalidQuery(res, query.error);

    return;
  }

  const list = await listSubjectPriorities(subjectId, query.data);

  if (!list) {
    sendError(res, 404, "subject_not_found");

    return;
  }

  sendJson(res, 200, list);
}

export async function handleListCurrentPriorities(res: http.ServerResponse, search: string): Promise<void> {
  const query = currentPrioritiesQuery.safeParse(queryOf(search));

  if (!query.success) {
    sendInvalidQuery(res, query.error);

    return;
  }

  sendJson(res, 200, await listCurrentPriorities(query.data.period, query.data.tz, new Date()));
}

export async function handleCreateSubjectPriority(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subjectId: string,
  search: string,
): Promise<void> {
  const tz = timeZoneQuery.safeParse(queryOf(search));
  const body = await readJsonBody(req, createSubjectPriorityInput);

  if (!tz.success || !body.ok) {
    sendJson(res, 400, {
      error: "invalid_input",
      message: body.ok ? tz.error?.issues : body.issues,
    });

    return;
  }

  sendMutation(res, await createSubjectPriority(subjectId, body.data, tz.data.tz), 201);
}

export async function handleUpdateSubjectPriority(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
  search: string,
): Promise<void> {
  const tz = timeZoneQuery.safeParse(queryOf(search));
  const body = await readJsonBody(req, updateSubjectPriorityInput);

  if (!tz.success || !body.ok) {
    sendJson(res, 400, {
      error: "invalid_input",
      message: body.ok ? tz.error?.issues : body.issues,
    });

    return;
  }

  sendMutation(res, await updateSubjectPriority(id, body.data, tz.data.tz), 200);
}

export async function handleDeleteSubjectPriority(res: http.ServerResponse, id: string): Promise<void> {
  if (!(await removeSubjectPriority(id))) {
    sendError(res, 404, "priority_not_found");

    return;
  }

  sendJson(res, 200, { deleted: true });
}
