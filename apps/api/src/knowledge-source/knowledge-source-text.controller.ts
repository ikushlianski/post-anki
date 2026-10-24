import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { getKnowledgeSourceText } from "./knowledge-source-text.repo.js";

const SOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

// GET /knowledge-sources/:id/text
export async function handleGetKnowledgeSourceText(
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  if (!SOURCE_ID_PATTERN.test(id)) {
    sendJson(res, 400, { error: "invalid_id" });
    return;
  }

  const text = await getKnowledgeSourceText(id);

  if (text === null) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { text });
}
