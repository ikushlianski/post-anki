import type http from "node:http";
import { z } from "zod";
import { isSafeSourceUrl } from "@post-anki/core";
import {
  describeKnowledgeSourceRefusal,
  KNOWLEDGE_SOURCE_MAX_CHARS,
  knowledgeItemModelIdSchema,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { kickSourcesAfterAdd } from "./knowledge-source-kick.js";
import { summarizeSourceAfterAdd } from "./knowledge-source-summary.starter.js";
import { fetchWithTimeout, truncateText } from "../shared/outbound-fetch.js";
import { extractArticleText } from "./article-text.js";
import {
  MAX_PAGE_TITLE_CHARS,
  MAX_PAGE_URL_CHARS,
  safePageUrl,
  withPageTitle,
} from "./knowledge-source-page-context.js";
import {
  findEarlierSourceByUrl,
  findEarlierSourcesByText,
  type EarlierKnowledgeSource,
} from "./knowledge-source-duplicate.repo.js";
import { findSubjectAssignmentError } from "../subject/subject-leaf.js";
import {
  insertKnowledgeSource,
  insertKnowledgeSources,
  MAX_SOURCES_PER_BATCH_ADD,
} from "./knowledge-source.repo.js";

const subjectIdInput = z.string().min(1).nullable().optional();
const modelIdInput = knowledgeItemModelIdSchema.nullable().optional();
const singleTextInput = z.object({
  text: z.string().max(KNOWLEDGE_SOURCE_MAX_CHARS),
  subjectId: subjectIdInput,
  modelId: modelIdInput,
  force: z.boolean().optional(),
  sourceUrl: z.string().max(MAX_PAGE_URL_CHARS).optional(),
  title: z.string().max(MAX_PAGE_TITLE_CHARS).optional(),
});
const batchTextInput = z.object({
  texts: z.array(z.string().max(KNOWLEDGE_SOURCE_MAX_CHARS)).min(1),
  subjectId: subjectIdInput,
  modelId: modelIdInput,
  force: z.boolean().optional(),
});
const urlInput = z
  .object({
    url: z.string().url(),
    subjectId: subjectIdInput,
    modelId: modelIdInput,
    force: z.boolean().optional(),
  })
  .strict();

// Null means "no subject"; a non-null id must name an existing subject.
async function rejectSubject(res: http.ServerResponse, subjectId: string | null): Promise<boolean> {
  const error = subjectId === null ? null : await findSubjectAssignmentError(subjectId);

  if (error) {
    sendError(res, 400, "subject_not_found", describeKnowledgeSourceRefusal("subject_not_found"));

    return true;
  }

  return false;
}

function sendInvalidInputIssues(res: http.ServerResponse, error: z.ZodError): void {
  const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  const tooLong = error.issues.some((i) => i.code === "too_big" && i.type === "string");

  if (!tooLong) {
    sendError(res, 400, "invalid_input", issues);
    return;
  }

  sendJson(res, 400, {
    error: "invalid_input",
    message: `${describeKnowledgeSourceRefusal("text_too_long")} (${issues})`,
    reason: "text_too_long",
  });
}

function sendAlreadyAdded(
  res: http.ServerResponse,
  earlier: { index?: number; source: EarlierKnowledgeSource }[],
): void {
  const duplicates = earlier.map(({ index, source }) => ({
    ...(index === undefined ? {} : { index }),
    existingId: source.id,
    addedAt: source.addedAt,
  }));

  sendJson(res, 409, {
    error: "already_added",
    message: describeKnowledgeSourceRefusal("already_added"),
    existingId: duplicates[0]?.existingId,
    addedAt: duplicates[0]?.addedAt,
    duplicates,
  });
}

export const extractVisibleText = extractArticleText;

const URL_FETCH_TIMEOUT_MS = 8_000;
const MAX_URL_SOURCE_CHARS = KNOWLEDGE_SOURCE_MAX_CHARS;

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
      sendInvalidInputIssues(res, body.error);
      return;
    }

    const subjectId = body.data.subjectId ?? null;

    if (await rejectSubject(res, subjectId)) {
      return;
    }

    let finalUrl = body.data.url;
    const html = await fetchWithTimeout(body.data.url, URL_FETCH_TIMEOUT_MS, (url) => {
      finalUrl = url;
    });

    if (html === null) {
      sendError(res, 400, "fetch_failed", describeKnowledgeSourceRefusal("fetch_failed"));
      return;
    }

    const fullText = extractVisibleText(html);
    const truncated = fullText.length > MAX_URL_SOURCE_CHARS;
    const extractedText = truncateText(fullText, MAX_URL_SOURCE_CHARS);

    if (extractedText.length === 0) {
      sendError(res, 400, "empty_content", describeKnowledgeSourceRefusal("empty_content"));
      return;
    }

    const sourceUrl = isSafeSourceUrl(finalUrl).allowed ? finalUrl : null;
    const earlierByUrl =
      body.data.force === true || sourceUrl === null ? null : await findEarlierSourceByUrl(sourceUrl, subjectId);

    if (earlierByUrl !== null) {
      sendAlreadyAdded(res, [{ source: earlierByUrl }]);
      return;
    }

    const urlSource = await insertKnowledgeSource(extractedText, subjectId, body.data.modelId ?? null, sourceUrl);
    await kickSourcesAfterAdd([urlSource.id]);
    await summarizeSourceAfterAdd(urlSource.id, extractedText);
    sendJson(res, 201, { ...urlSource, truncated });
    return;
  }

  if (isBatch) {
    const body = batchTextInput.safeParse(rawBody.ok ? rawBody.data : undefined);

    if (!body.success) {
      sendInvalidInputIssues(res, body.error);
      return;
    }

    const subjectId = body.data.subjectId ?? null;

    if (await rejectSubject(res, subjectId)) {
      return;
    }

    const texts = body.data.texts.map((text) => text.trim()).filter((text) => text.length > 0);

    if (texts.length === 0) {
      sendError(res, 400, "invalid_input", "texts: must not be empty");
      return;
    }

    if (texts.length > MAX_SOURCES_PER_BATCH_ADD) {
      sendError(
        res,
        400,
        "invalid_input",
        `texts: must not exceed ${MAX_SOURCES_PER_BATCH_ADD} entries`,
      );
      return;
    }

    const earlierByText =
      body.data.force === true ? new Map<string, EarlierKnowledgeSource>() : await findEarlierSourcesByText(texts, subjectId);
    const repeated = texts.flatMap((text, index) => {
      const source = earlierByText.get(text);

      return source === undefined ? [] : [{ index, source }];
    });

    if (repeated.length > 0) {
      sendAlreadyAdded(res, repeated);
      return;
    }

    const batchSources = await insertKnowledgeSources(texts, subjectId, body.data.modelId ?? null);
    await kickSourcesAfterAdd(batchSources.map((s) => s.id));
    sendJson(res, 201, batchSources);
    return;
  }

  const body = singleTextInput.safeParse(rawBody.ok ? rawBody.data : undefined);

  if (!rawBody.ok) {
    sendError(res, 400, "invalid_input", rawBody.issues || "Request body is not valid JSON.");
    return;
  }

  if (!body.success) {
    sendInvalidInputIssues(res, body.error);
    return;
  }

  const text = body.data.text.trim();

  if (text.length === 0) {
    sendError(res, 400, "invalid_input", "text: must not be empty");
    return;
  }

  const subjectId = body.data.subjectId ?? null;

  if (await rejectSubject(res, subjectId)) {
    return;
  }

  const pageUrl = safePageUrl(body.data.sourceUrl);
  const storedText = withPageTitle(text, body.data.title);
  const earlierSingle =
    body.data.force === true ? undefined : (await findEarlierSourcesByText([storedText], subjectId)).get(storedText);

  if (earlierSingle !== undefined) {
    sendAlreadyAdded(res, [{ source: earlierSingle }]);
    return;
  }

  const source =
    pageUrl === null
      ? await insertKnowledgeSource(storedText, subjectId, body.data.modelId ?? null)
      : await insertKnowledgeSource(storedText, subjectId, body.data.modelId ?? null, pageUrl);
  await kickSourcesAfterAdd([source.id]);
  sendJson(res, 201, source);
}
