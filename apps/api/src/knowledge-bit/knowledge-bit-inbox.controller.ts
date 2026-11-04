import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import {
  countInboxKnowledgeBits,
  discardKnowledgeBitFromInbox,
  listInboxKnowledgeBits,
  moveKnowledgeBitToInbox,
  returnKnowledgeBitFromInbox,
} from "./knowledge-bit-inbox.repo.js";

const INBOX_LIST_LIMIT = 200;

// POST /knowledge-bits/:id/inbox
export async function handleMoveKnowledgeBitToInbox(res: http.ServerResponse, id: string): Promise<void> {
  const result = await moveKnowledgeBitToInbox(id);

  if (!result.ok) {
    sendError(res, result.reason === "blocked" ? 409 : 404, result.reason);
    return;
  }

  sendJson(res, 200, { ok: true, inboxCount: result.value });
}

// DELETE /knowledge-bits/:id/inbox
export async function handleReturnKnowledgeBitFromInbox(res: http.ServerResponse, id: string): Promise<void> {
  const result = await returnKnowledgeBitFromInbox(id);

  if (!result.ok) {
    sendError(res, result.reason === "blocked" ? 409 : 404, result.reason);
    return;
  }

  sendJson(res, 200, { ok: true });
}

// POST /knowledge-bits/:id/inbox/discard
export async function handleDiscardKnowledgeBitFromInbox(res: http.ServerResponse, id: string): Promise<void> {
  const result = await discardKnowledgeBitFromInbox(id);

  if (!result.ok) {
    sendError(res, result.reason === "blocked" ? 409 : 404, result.reason);
    return;
  }

  sendJson(res, 200, { ok: true });
}

// GET /knowledge-bits/inbox
export async function handleListInboxKnowledgeBits(res: http.ServerResponse): Promise<void> {
  const [items, count] = await Promise.all([listInboxKnowledgeBits(INBOX_LIST_LIMIT), countInboxKnowledgeBits()]);

  sendJson(res, 200, { items, count, total: count, hasMore: count > items.length });
}
