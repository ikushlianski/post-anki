import type http from "node:http";
import {
  createTopicInput,
  reorderInput,
  updateTopicInput,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  createTopic,
  deleteTopic,
  reorderTopics,
  updateTopic,
} from "./topic.repo.js";
import { getTopicRow } from "./topic-progress.repo.js";
import { listGapsForTopic } from "../gap/gap.repo.js";

export async function handleListTopicGaps(
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const topic = await getTopicRow(topicId);

  if (!topic) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, await listGapsForTopic(topicId));
}

export async function handleCreateTopic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  moduleId: string,
): Promise<void> {
  const body = await readJsonBody(
    req,
    createTopicInput.omit({ moduleId: true }),
  );

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const topic = await createTopic({ ...body.data, moduleId });

  if (!topic) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 201, topic);
}

export async function handleUpdateTopic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const body = await readJsonBody(req, updateTopicInput.omit({ topicId: true }));

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const topic = await updateTopic({ ...body.data, topicId });

  if (!topic) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, topic);
}

export async function handleDeleteTopic(
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const ok = await deleteTopic(topicId);

  if (!ok) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { id: topicId, deleted: true });
}

export async function handleReorderTopics(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, reorderInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  await reorderTopics(body.data.orderedIds);

  sendJson(res, 200, { reordered: body.data.orderedIds.length });
}
