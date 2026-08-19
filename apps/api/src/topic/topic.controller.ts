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
import { refetchSource } from "../content-library/content-library.service.js";
import { log } from "../shared/log.js";

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

  // S7 — accepting a "go deeper" offer (headroom-offer.tsx's onAccept)
  // stamps learningStatus "going_deeper" on this same update call. Before
  // writing the new elected depth, re-fetch the topic's own source page
  // (not a fresh unrelated search) so the harder content generated at the
  // new depth is grounded in current material. Best-effort: a failed
  // re-fetch never blocks the depth election itself — refetchSource already
  // never clobbers a previously-good fetchedText on failure.
  if (body.data.learningStatus === "going_deeper") {
    const existing = await getTopicRow(topicId);

    if (existing?.sourceId) {
      await refetchSource(existing.sourceId).catch((err) => {
        log.error({ err, topicId, sourceId: existing.sourceId }, "go_deeper_refetch_failed");
      });
    }
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
