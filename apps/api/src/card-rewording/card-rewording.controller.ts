import type http from "node:http";
import { decideRewordedDraftInputSchema } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { decideRewordedDraft, listPendingRewordedDrafts } from "./card-rewording.repo.js";

const PENDING_DRAFTS_LIMIT = 50;

export async function handleListRewordedDrafts(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, { drafts: await listPendingRewordedDrafts(getDb(), PENDING_DRAFTS_LIMIT) });
}

export async function handleDecideRewordedDraft(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, decideRewordedDraftInputSchema);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await decideRewordedDraft(getDb(), id, body.data.decision);

  if (result.status === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result.status === "conflict") {
    sendError(res, 409, "draft_not_decidable");
    return;
  }

  sendJson(res, 200, { id, decision: body.data.decision, variantId: result.variantId });
}
