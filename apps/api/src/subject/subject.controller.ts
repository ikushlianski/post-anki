import type http from "node:http";
import { createSubjectInput, mergeSubjectsInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { createSubject, deleteSubject, listSubjects, mergeSubjects } from "./subject.repo.js";

export async function handleListSubjects(
  res: http.ServerResponse,
): Promise<void> {
  sendJson(res, 200, await listSubjects());
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

  sendJson(res, 201, await createSubject(body.data));
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
