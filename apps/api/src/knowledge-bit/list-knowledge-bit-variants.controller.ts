import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import { getKnowledgeBitById } from "./knowledge-bit.repo.js";
import { listActiveVariantsForBit } from "./knowledge-bit-question-variant.repo.js";

// GET /knowledge-bits/:bitId/variants
export async function handleListKnowledgeBitVariants(
  res: http.ServerResponse,
  bitId: string,
): Promise<void> {
  const bit = await getKnowledgeBitById(bitId);

  if (!bit) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { variants: await listActiveVariantsForBit(bitId) });
}
