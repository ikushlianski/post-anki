import type http from "node:http";
import { z } from "zod";
import { readJsonBody, sendJson } from "../shared/http.js";
import {
  insertKnowledgeSource,
  insertKnowledgeSources,
  MAX_SOURCES_PER_BATCH_ADD,
} from "./knowledge-source.repo.js";

const singleTextInput = z.object({ text: z.string().max(50_000) });
const batchTextInput = z.object({ texts: z.array(z.string().max(50_000)).min(1) });

export async function handleCreateKnowledgeSource(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const rawBody = await readJsonBody(req, z.unknown());
  const isBatch = rawBody.ok && typeof rawBody.data === "object" && rawBody.data !== null && "texts" in rawBody.data;

  if (isBatch) {
    const body = batchTextInput.safeParse(rawBody.ok ? rawBody.data : undefined);

    if (!body.success) {
      const issues = body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

      sendJson(res, 400, { error: "invalid_input", message: issues });
      return;
    }

    const texts = body.data.texts.map((text) => text.trim()).filter((text) => text.length > 0);

    if (texts.length === 0) {
      sendJson(res, 400, { error: "invalid_input", message: "texts: must not be empty" });
      return;
    }

    if (texts.length > MAX_SOURCES_PER_BATCH_ADD) {
      sendJson(res, 400, {
        error: "invalid_input",
        message: `texts: must not exceed ${MAX_SOURCES_PER_BATCH_ADD} entries`,
      });
      return;
    }

    sendJson(res, 201, await insertKnowledgeSources(texts));
    return;
  }

  const body = singleTextInput.safeParse(rawBody.ok ? rawBody.data : undefined);

  if (!rawBody.ok) {
    sendJson(res, 400, { error: "invalid_input", message: rawBody.issues });
    return;
  }

  if (!body.success) {
    const issues = body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

    sendJson(res, 400, { error: "invalid_input", message: issues });
    return;
  }

  const text = body.data.text.trim();

  if (text.length === 0) {
    sendJson(res, 400, { error: "invalid_input", message: "text: must not be empty" });
    return;
  }

  sendJson(res, 201, await insertKnowledgeSource(text));
}
