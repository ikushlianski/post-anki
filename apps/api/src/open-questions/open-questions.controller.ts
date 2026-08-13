import type http from "node:http";
import {
  captureOpenQuestionInput,
  listOpenQuestionsQuerySchema,
  resolveOpenQuestionInput,
  type OpenQuestionsListResult,
  type OpenQuestion,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { resolveProbeQuestionItem, resolveSocraticTurnItem } from "../shared/study-item.js";
import {
  countOpenQuestions,
  insertOpenQuestion,
  listOpenQuestions,
  resolveOpenQuestion as resolveOpenQuestionRow,
} from "./open-questions.repo.js";

async function handleCapture(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sourceType: "probe_question" | "socratic_turn",
  sourceItemId: string,
): Promise<void> {
  const body = await readJsonBody(req, captureOpenQuestionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const item =
    sourceType === "probe_question"
      ? await resolveProbeQuestionItem(sourceItemId)
      : await resolveSocraticTurnItem(sourceItemId);

  if (!item) {
    sendError(res, 404, "not_found");
    return;
  }

  const openQuestion: OpenQuestion = await insertOpenQuestion({
    sourceType,
    sourceItemId,
    topicId: item.topicId,
    topicTitle: item.topicTitle,
    questionText: body.data.questionText,
  });

  sendJson(res, 200, openQuestion);
}

export function handleCaptureProbeQuestionOpenQuestion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  questionId: string,
): Promise<void> {
  return handleCapture(req, res, "probe_question", questionId);
}

export function handleCaptureSocraticTurnOpenQuestion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  turnId: string,
): Promise<void> {
  return handleCapture(req, res, "socratic_turn", turnId);
}

export async function handleListOpenQuestions(
  res: http.ServerResponse,
  rawStatus: string | null,
  rawLimit: string | null,
): Promise<void> {
  const parsed = listOpenQuestionsQuerySchema.safeParse({
    status: rawStatus || undefined,
    limit: rawLimit || undefined,
  });

  if (!parsed.success) {
    sendError(res, 400, "invalid_input");
    return;
  }

  const { status, limit } = parsed.data;

  const [items, totalCount] = await Promise.all([
    listOpenQuestions(status, limit),
    countOpenQuestions(status),
  ]);

  const body: OpenQuestionsListResult = { items, totalCount };

  sendJson(res, 200, body);
}

export async function handleResolveOpenQuestion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, resolveOpenQuestionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const resolved = await resolveOpenQuestionRow(
    id,
    body.data.status,
    body.data.answerText ?? null,
  );

  if (!resolved) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, resolved);
}
