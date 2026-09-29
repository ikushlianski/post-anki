import type http from "node:http";
import { draftKnowledgeBitChatInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import {
  draftKnowledgeBitChat,
  type KnowledgeBitChatDraftError,
} from "./knowledge-bit-chat-draft.service.js";

const STATUS: Record<KnowledgeBitChatDraftError, number> = {
  not_found: 404,
  draft_failed: 502,
};

export async function handleDraftKnowledgeBitChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, draftKnowledgeBitChatInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await draftKnowledgeBitChat(id, body.data);

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}
