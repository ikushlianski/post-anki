import type http from "node:http";
import { z } from "zod";
import { convert } from "html-to-text";
import { readJsonBody, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { kickKnowledgeBitPipeline } from "../knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.js";
import { fetchWithTimeout, truncateText } from "../shared/outbound-fetch.js";
import { getSubject } from "../subject/subject.repo.js";
import {
  insertKnowledgeSource,
  insertKnowledgeSources,
  MAX_SOURCES_PER_BATCH_ADD,
} from "./knowledge-source.repo.js";

const subjectIdInput = z.string().min(1).nullable().optional();
const singleTextInput = z.object({ text: z.string().max(50_000), subjectId: subjectIdInput });
const batchTextInput = z.object({
  texts: z.array(z.string().max(50_000)).min(1),
  subjectId: subjectIdInput,
});
const urlInput = z.object({ url: z.string().url(), subjectId: subjectIdInput }).strict();

// Null means "no subject"; a non-null id must name an existing subject.
async function isUnknownSubject(subjectId: string | null): Promise<boolean> {
  return subjectId !== null && (await getSubject(subjectId)) === null;
}

function kickPipelineInBackground(): void {
  void kickKnowledgeBitPipeline().catch((err) => log.error({ err }, "knowledge_bit_pipeline_kick_failed"));
}

const URL_FETCH_TIMEOUT_MS = 8_000;
const MAX_URL_SOURCE_CHARS = 50_000;

export async function handleCreateKnowledgeSource(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const rawBody = await readJsonBody(req, z.unknown());
  const isBatch = rawBody.ok && typeof rawBody.data === "object" && rawBody.data !== null && "texts" in rawBody.data;
  const isUrl = rawBody.ok && typeof rawBody.data === "object" && rawBody.data !== null && "url" in rawBody.data;

  if (isUrl) {
    const body = urlInput.safeParse(rawBody.ok ? rawBody.data : undefined);

    if (!body.success) {
      const issues = body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

      sendJson(res, 400, { error: "invalid_input", message: issues });
      return;
    }

    const subjectId = body.data.subjectId ?? null;

    if (await isUnknownSubject(subjectId)) {
      sendJson(res, 400, { error: "subject_not_found" });
      return;
    }

    const html = await fetchWithTimeout(body.data.url, URL_FETCH_TIMEOUT_MS);

    if (html === null) {
      sendJson(res, 400, { error: "fetch_failed" });
      return;
    }

    const extractedText = truncateText(convert(html).trim(), MAX_URL_SOURCE_CHARS);

    if (extractedText.length === 0) {
      sendJson(res, 400, { error: "empty_content" });
      return;
    }

    sendJson(res, 201, await insertKnowledgeSource(extractedText, subjectId));
    kickPipelineInBackground();
    return;
  }

  if (isBatch) {
    const body = batchTextInput.safeParse(rawBody.ok ? rawBody.data : undefined);

    if (!body.success) {
      const issues = body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

      sendJson(res, 400, { error: "invalid_input", message: issues });
      return;
    }

    const subjectId = body.data.subjectId ?? null;

    if (await isUnknownSubject(subjectId)) {
      sendJson(res, 400, { error: "subject_not_found" });
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

    sendJson(res, 201, await insertKnowledgeSources(texts, subjectId));
    kickPipelineInBackground();
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

  const subjectId = body.data.subjectId ?? null;

  if (await isUnknownSubject(subjectId)) {
    sendJson(res, 400, { error: "subject_not_found" });
    return;
  }

  sendJson(res, 201, await insertKnowledgeSource(text, subjectId));
  kickPipelineInBackground();
}
