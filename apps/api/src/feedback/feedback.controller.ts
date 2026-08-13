import type http from "node:http";
import { submitItemFeedbackInput, type ItemFeedback } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { resolveProbeQuestionItem, resolveSocraticTurnItem } from "../shared/study-item.js";
import { upsertItemFeedback } from "./feedback.repo.js";

async function handleSubmitFeedback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  itemType: "probe_question" | "socratic_turn",
  itemId: string,
): Promise<void> {
  const body = await readJsonBody(req, submitItemFeedbackInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const item =
    itemType === "probe_question"
      ? await resolveProbeQuestionItem(itemId)
      : await resolveSocraticTurnItem(itemId);

  if (!item) {
    sendError(res, 404, "not_found");
    return;
  }

  const feedback: ItemFeedback = await upsertItemFeedback({
    itemType,
    itemId,
    topicId: item.topicId,
    itemText: item.itemText,
    rating: body.data.rating,
    comment: body.data.comment ?? null,
  });

  sendJson(res, 200, feedback);
}

export function handleSubmitProbeQuestionFeedback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  questionId: string,
): Promise<void> {
  return handleSubmitFeedback(req, res, "probe_question", questionId);
}

export function handleSubmitSocraticTurnFeedback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  turnId: string,
): Promise<void> {
  return handleSubmitFeedback(req, res, "socratic_turn", turnId);
}
