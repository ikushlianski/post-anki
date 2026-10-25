import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { getKnowledgeBitDetail } from "./knowledge-bit-detail.repo.js";

// GET /knowledge-bits/:id
export async function handleGetKnowledgeBitDetail(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const detail = await getKnowledgeBitDetail(id);

  if (!detail) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, detail);
}
