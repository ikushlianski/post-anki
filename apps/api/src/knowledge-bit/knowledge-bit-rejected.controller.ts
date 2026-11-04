import type http from "node:http";
import { rejectedCardsQuerySchema } from "@post-anki/shared";
import { sendError, sendJson, sendInvalidQuery } from "../shared/http.js";
import { listRejectedKnowledgeBits, restoreRejectedOnly } from "./knowledge-bit-rejected.repo.js";

// GET /knowledge-bits/rejected
export async function handleListRejectedKnowledgeBits(res: http.ServerResponse, search: string): Promise<void> {
  const parsed = rejectedCardsQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    sendInvalidQuery(res, parsed.error);
    return;
  }

  sendJson(res, 200, await listRejectedKnowledgeBits(parsed.data));
}

// POST /knowledge-bits/:id/restore-rejected
export async function handleRestoreRejectedOnly(res: http.ServerResponse, id: string): Promise<void> {
  const result = await restoreRejectedOnly(id);

  if (result === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result === "not_rejected") {
    sendError(res, 409, "not_rejected");
    return;
  }

  sendJson(res, 200, { ok: true });
}
