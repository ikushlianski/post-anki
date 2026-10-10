import type http from "node:http";
import { bulkApproveKnowledgeBitsInput } from "@post-anki/shared";
import { readJsonBody, sendJson } from "../shared/http.js";
import {
  approveKnowledgeBitsBulk,
  countPendingKnowledgeBits,
} from "./knowledge-bit-bulk-approval.repo.js";

// POST /knowledge-bits/approvals
export async function handleBulkApproveKnowledgeBits(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, bulkApproveKnowledgeBitsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  sendJson(res, 200, await approveKnowledgeBitsBulk(body.data.knowledgeBitIds));
}

// GET /knowledge-bits/pending-review/count
export async function handleCountPendingKnowledgeBits(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, { count: await countPendingKnowledgeBits() });
}
