import type http from "node:http";
import { eq } from "drizzle-orm";
import { submitItemFeedbackInput, type ItemFeedback } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { getDb } from "../db/client.js";
import { probeSessionQuestions, socraticSessions, socraticTurns } from "../db/schema.js";
import { upsertItemFeedback } from "./feedback.repo.js";

async function resolveProbeQuestionItem(
  questionId: string,
): Promise<{ topicId: string | null; itemText: string } | null> {
  const row = (
    await getDb()
      .select()
      .from(probeSessionQuestions)
      .where(eq(probeSessionQuestions.id, questionId))
  )[0];

  if (!row) {
    return null;
  }

  return { topicId: row.topicId, itemText: row.prompt };
}

async function resolveSocraticTurnItem(
  turnId: string,
): Promise<{ topicId: string | null; itemText: string } | null> {
  const turnRow = (
    await getDb().select().from(socraticTurns).where(eq(socraticTurns.id, turnId))
  )[0];

  if (!turnRow) {
    return null;
  }

  const sessionRow = (
    await getDb()
      .select()
      .from(socraticSessions)
      .where(eq(socraticSessions.id, turnRow.sessionId))
  )[0];

  return { topicId: sessionRow?.topicId ?? null, itemText: turnRow.prompt };
}

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
