import type http from "node:http";
import { eq } from "drizzle-orm";
import { addNodeCommentInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { getDb } from "../db/client.js";
import { modules, topics } from "../db/schema.js";
import { insertNodeComment } from "./node-feedback.repo.js";

export async function handleAddModuleComment(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  moduleId: string,
): Promise<void> {
  const body = await readJsonBody(req, addNodeCommentInput.omit({ nodeId: true }));

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const existing = (
    await getDb().select().from(modules).where(eq(modules.id, moduleId))
  )[0];

  if (!existing) {
    sendError(res, 404, "not_found");
    return;
  }

  const comment = await insertNodeComment("module", moduleId, body.data.comment);

  sendJson(res, 201, comment);
}

export async function handleAddTopicComment(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const body = await readJsonBody(req, addNodeCommentInput.omit({ nodeId: true }));

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const existing = (
    await getDb().select().from(topics).where(eq(topics.id, topicId))
  )[0];

  if (!existing) {
    sendError(res, 404, "not_found");
    return;
  }

  const comment = await insertNodeComment("topic", topicId, body.data.comment);

  sendJson(res, 201, comment);
}
