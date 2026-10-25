import type http from "node:http";
import { bulkApproveKnowledgeBitsInput } from "@post-anki/shared";
import { readJsonBody, sendJson } from "../shared/http.js";
import { embedApprovedKnowledgeBits } from "./knowledge-bit-approval-embedding.orchestrator.js";
import {
  approveKnowledgeBitsBulk,
  countPendingKnowledgeBits,
} from "./knowledge-bit-bulk-approval.repo.js";
import { countSourcesNeedingAttention } from "./knowledge-source-attention.repo.js";

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

  const result = await approveKnowledgeBitsBulk(body.data.knowledgeBitIds);

  await embedApprovedKnowledgeBits(result.approved);

  sendJson(res, 200, result);
}

// GET /knowledge-bits/pending-review/count
export async function handleCountPendingKnowledgeBits(res: http.ServerResponse): Promise<void> {
  const [count, attentionCount] = await Promise.all([
    countPendingKnowledgeBits(),
    countSourcesNeedingAttention(),
  ]);

  sendJson(res, 200, { count, attentionCount });
}
