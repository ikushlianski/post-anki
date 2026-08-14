import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import { compileCards } from "./cards.orchestrator.js";
import { getCardsByTopic, startGeneratingCards } from "./cards.repo.js";

export async function handleCompileCards(
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const topic = await getTopicRow(topicId);

  if (!topic) {
    sendError(res, 404, "not_found");
    return;
  }

  const cardSet = await startGeneratingCards(topicId);

  sendJson(res, 202, cardSet);

  void compileCards(topicId).catch((err) =>
    log.error({ err, topicId }, "cards_compile_dispatch_failed"),
  );
}

export async function handleGetCards(
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const cardSet = await getCardsByTopic(topicId);

  if (!cardSet) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, cardSet);
}
