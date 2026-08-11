import type http from "node:http";
import {
  captureLearningListItemInput,
  learningListItemStatusSchema,
  nudgeResponseSchema,
  resolveLearningListRecommendationInput,
  type LearningListItemStatus,
} from "@post-anki/shared";
import { z } from "zod";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { readLivenessStatuses } from "../liveness/liveness.repo.js";
import { captureLearningListItem } from "./learning-list-classification.orchestrator.js";
import {
  approveRecommendation,
  declineRecommendation,
  respondToLearningListNudge,
} from "./learning-list-approval.orchestrator.js";
import { getLearningListItem, listLearningListItems } from "./learning-list.repo.js";

const respondToNudgeInput = z.object({ response: nudgeResponseSchema });

const SOURCE_ERROR_STATUS: Record<string, number> = {
  video_requires_description: 400,
  source_blocked: 400,
  source_unreachable: 502,
  source_empty: 422,
};

export async function handleCaptureLearningListItem(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, captureLearningListItemInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  try {
    const result = await captureLearningListItem(body.data);

    if ("error" in result) {
      sendJson(res, SOURCE_ERROR_STATUS[result.error] ?? 400, {
        error: result.error,
        message: result.message,
        itemId: result.itemId,
      });
      return;
    }

    sendJson(res, 201, result);
  } catch (err) {
    log.error({ err, url: body.data.url }, "learning_list_capture_failed");

    const message = err instanceof Error ? err.message : "classification failed";

    sendError(res, 502, "classification_failed", message);
  }
}

export async function handleListLearningListItems(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const status = parseStatusFilter(req.url);

  if (status === "invalid") {
    sendError(res, 400, "invalid_status");
    return;
  }

  const items = await listLearningListItems(status ?? undefined);
  const livenessByRef = await readLivenessStatuses(
    items.map((item) => ({ entityType: "learning_list_item" as const, entityId: item.id })),
  );

  sendJson(
    res,
    200,
    items.map((item) => ({
      ...item,
      liveness: livenessByRef.get(`learning_list_item:${item.id}`) ?? null,
    })),
  );
}

export async function handleGetLearningListItem(
  res: http.ServerResponse,
  itemId: string,
): Promise<void> {
  const item = await getLearningListItem(itemId);

  if (!item) {
    sendError(res, 404, "not_found");
    return;
  }

  const livenessByRef = await readLivenessStatuses([
    { entityType: "learning_list_item", entityId: itemId },
  ]);

  sendJson(res, 200, {
    ...item,
    liveness: livenessByRef.get(`learning_list_item:${itemId}`) ?? null,
  });
}

export async function handleResolveLearningListRecommendation(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  itemId: string,
): Promise<void> {
  const body = await readJsonBody(req, resolveLearningListRecommendationInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result =
    body.data.decision === "approve"
      ? await approveRecommendation(itemId)
      : await declineRecommendation(itemId);

  if ("error" in result) {
    if (result.error === "not_found") {
      sendError(res, 404, "not_found");
      return;
    }

    if (result.error === "not_awaiting_decision") {
      sendError(res, 409, "not_awaiting_decision");
      return;
    }

    sendError(res, 400, result.error);
    return;
  }

  sendJson(res, 200, result);
}

export async function handleCreateLearningListNudgeResponse(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  itemId: string,
): Promise<void> {
  const body = await readJsonBody(req, respondToNudgeInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await respondToLearningListNudge(itemId, body.data.response);

  if ("error" in result) {
    sendError(res, result.error === "not_found" ? 404 : 409, result.error);
    return;
  }

  sendJson(res, 201, result);
}

function parseStatusFilter(url: string | undefined): LearningListItemStatus | null | "invalid" {
  const raw = new URL(url ?? "/", "http://localhost").searchParams.get("status");

  if (raw === null) {
    return null;
  }

  const parsed = learningListItemStatusSchema.safeParse(raw);

  return parsed.success ? parsed.data : "invalid";
}
