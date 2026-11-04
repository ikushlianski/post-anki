import type http from "node:http";
import { createNotionIngestionSourceInput, updateNotionIngestionSourceInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { findSubjectAssignmentError } from "../subject/subject-leaf.js";
import {
  createNotionSource,
  deleteNotionSource,
  getNotionSourceView,
  listNotionSources,
  updateNotionSource,
} from "./notion-ingestion-source.repo.js";

export async function handleListNotionSources(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, { sources: await listNotionSources() });
}

export async function handleCreateNotionSource(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, createNotionIngestionSourceInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  if (await findSubjectAssignmentError(body.data.subjectId)) {
    sendError(res, 400, "subject_not_found");
    return;
  }

  const result = await createNotionSource(body.data);

  if (result.kind === "duplicate_page") {
    sendError(res, 409, "page_already_added");
    return;
  }

  if (result.kind === "invalid_url") {
    sendError(res, 400, "invalid_input");
    return;
  }

  sendJson(res, 201, await getNotionSourceView(result.source.id));
}

export async function handleUpdateNotionSource(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, updateNotionIngestionSourceInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  if (body.data.subjectId && (await findSubjectAssignmentError(body.data.subjectId))) {
    sendError(res, 400, "subject_not_found");
    return;
  }

  const result = await updateNotionSource(id, body.data);

  if (result.kind === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result.kind === "duplicate_page") {
    sendError(res, 409, "page_already_added");
    return;
  }

  if (result.kind === "invalid_url") {
    sendError(res, 400, "invalid_input");
    return;
  }

  sendJson(res, 200, await getNotionSourceView(id));
}

export async function handleDeleteNotionSource(res: http.ServerResponse, id: string): Promise<void> {
  if (!(await deleteNotionSource(id))) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { deleted: true });
}
