import type http from "node:http";
import {
  createSubjectInput,
  mergeSubjectsInput,
  subjectSearchQueryInput,
  updateSubjectInput,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  createSubject,
  deleteSubject,
  getSubject,
  listSubjects,
  mergeSubjects,
  searchSubjectsByText,
  updateSubject,
} from "./subject.repo.js";

// GET /subjects serves both the full list and, when ?query= is present, a ranked search.
export async function handleListSubjects(
  res: http.ServerResponse,
  queryParam: string | null,
): Promise<void> {
  if (queryParam === null) {
    sendJson(res, 200, await listSubjects());
    return;
  }

  const query = subjectSearchQueryInput.safeParse(queryParam);

  if (!query.success) {
    sendJson(res, 400, { error: "invalid_input", message: query.error.issues });
    return;
  }

  sendJson(res, 200, await searchSubjectsByText(query.data));
}

export async function handleCreateSubject(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, createSubjectInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  if (body.data.parentId && !(await getSubject(body.data.parentId))) {
    sendJson(res, 400, { error: "parent_not_found" });
    return;
  }

  sendJson(res, 201, await createSubject(body.data));
}

export async function handleUpdateSubject(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  const body = await readJsonBody(req, updateSubjectInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await updateSubject(subjectId, body.data);

  if (!result.ok) {
    sendJson(res, 400, { error: result.error });
    return;
  }

  if (!result.subject) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, result.subject);
}

export async function handleDeleteSubject(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  const ok = await deleteSubject(subjectId);

  if (!ok) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { id: subjectId, deleted: true });
}

export async function handleMergeSubjects(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetId: string,
): Promise<void> {
  const body = await readJsonBody(req, mergeSubjectsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await mergeSubjects(targetId, body.data.sourceSubjectId);

  if ("error" in result) {
    if (result.error === "not_found") {
      sendError(res, 404, "not_found");
      return;
    }

    sendJson(res, 400, { error: result.error });
    return;
  }

  sendJson(res, 200, result);
}
