import type http from "node:http";
import { generateKnowledgeBitExampleInput, type KnowledgeBitExampleError } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { generateKnowledgeBitExample } from "./knowledge-bit-example.service.js";

const STATUS: Record<KnowledgeBitExampleError, number> = {
  not_found: 404,
  blocked: 409,
  example_exists: 409,
  limit_reached: 409,
  generation_failed: 502,
  budget_exceeded: 503,
};

// POST /knowledge-bits/:id/example
export async function handleGenerateKnowledgeBitExample(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, generateKnowledgeBitExampleInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await generateKnowledgeBitExample(id, body.data.overwrite);

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}
