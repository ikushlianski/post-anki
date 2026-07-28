import type http from "node:http";
import { assignTagInput, createTagInput, mergeTagsInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  addTagAssignment,
  createOrGetTag,
  deleteTagAssignment,
  getAllTags,
  mergeTagsService,
} from "./tag.service.js";

export async function handleListTags(res: http.ServerResponse): Promise<void> {
  const tags = await getAllTags();

  sendJson(res, 200, tags);
}

export async function handleCreateTag(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, createTagInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const tag = await createOrGetTag(body.data.name);

  sendJson(res, 201, tag);
}

export async function handleAssignTag(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  tagId: string,
): Promise<void> {
  const body = await readJsonBody(req, assignTagInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await addTagAssignment(tagId, body.data.nodeType, body.data.nodeId);

  if ("error" in result) {
    sendError(res, 404, result.error);
    return;
  }

  sendJson(res, 201, result);
}

export async function handleRemoveTagAssignment(
  res: http.ServerResponse,
  tagId: string,
  assignmentId: string,
): Promise<void> {
  const removed = await deleteTagAssignment(tagId, assignmentId);

  if (!removed) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { ok: true });
}

export async function handleMergeTags(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetId: string,
): Promise<void> {
  const body = await readJsonBody(req, mergeTagsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await mergeTagsService(targetId, body.data.sourceTagId);

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
