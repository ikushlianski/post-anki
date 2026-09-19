import type http from "node:http";
import { normalizeSearchQuery } from "@post-anki/core";
import type { CardMatchResult } from "@post-anki/shared";
import { sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import { compileCards } from "./cards.orchestrator.js";
import { triggerCardEmbeddingScan } from "./cards-embedding.orchestrator.js";
import { findTopMatchingCards } from "./cards-retrieval.orchestrator.js";
import {
  getCardsByTopic,
  getCurriculumCardsSummary,
  listCardsForCurriculum,
  startGeneratingCards,
} from "./cards.repo.js";

const CARD_MATCH_DEFAULT_LIMIT = 10;

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

export async function handleGetCurriculumCardsSummary(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const summary = await getCurriculumCardsSummary(curriculumId);

  sendJson(res, 200, summary);
}

export async function handleListCurriculumCards(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const rows = await listCardsForCurriculum(curriculumId);

  sendJson(res, 200, rows);
}

// A failure here is a real 502 — never a silent "nothing needed embedding".
export async function handleTriggerCardEmbeddingScan(res: http.ServerResponse): Promise<void> {
  try {
    const result = await triggerCardEmbeddingScan();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "card_embedding_scan_failed");

    const message = err instanceof Error ? err.message : "card embedding scan failed";

    sendError(res, 502, "scan_failed", message);
  }
}

export async function handleFindTopMatchingCards(
  res: http.ServerResponse,
  queryParam: string | null,
  limitParam: string | null,
): Promise<void> {
  const normalized = normalizeSearchQuery(queryParam ?? "");

  if (normalized === null) {
    sendJson(res, 200, [] satisfies CardMatchResult[]);
    return;
  }

  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 50)
      : CARD_MATCH_DEFAULT_LIMIT;

  const results = await findTopMatchingCards(normalized, limit);

  sendJson(res, 200, results);
}
