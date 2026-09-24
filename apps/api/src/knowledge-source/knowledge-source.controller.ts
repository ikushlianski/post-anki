import type http from "node:http";
import { z } from "zod";
import { readJsonBody, sendJson } from "../shared/http.js";
import { insertKnowledgeSource } from "./knowledge-source.repo.js";

const createKnowledgeSourceInput = z.object({
  text: z.string(),
});

export async function handleCreateKnowledgeSource(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, createKnowledgeSourceInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const text = body.data.text.trim();

  if (text.length === 0) {
    sendJson(res, 400, { error: "invalid_input", message: "text: must not be empty" });
    return;
  }

  sendJson(res, 201, await insertKnowledgeSource(text));
}
