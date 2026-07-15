import type http from "node:http";
import { askStudyChatInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { askStudyChat, type StudyChatError } from "./study-chat.service.js";

const STATUS: Record<StudyChatError, number> = {
  not_found: 404,
};

export async function handleAskStudyChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  topicId: string,
): Promise<void> {
  const body = await readJsonBody(
    req,
    askStudyChatInput.omit({ topicId: true }),
  );

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await askStudyChat({ ...body.data, topicId });

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}
