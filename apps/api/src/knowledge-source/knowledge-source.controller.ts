import type http from "node:http";
import { z } from "zod";
import { isSafeSourceUrl } from "@post-anki/core";
import {
  describeKnowledgeSourceRefusal,
  targetPhrasesSchema,
  highlightsFitText,
  knowledgeHighlightsSchema,
  mergeHighlights,
  type KnowledgeHighlight,
  KNOWLEDGE_SOURCE_MAX_CHARS,
  knowledgeItemModelIdSchema,
} from "@post-anki/shared";
import { BodyTooLargeError, readJsonBody, sendError, sendJson } from "../shared/http.js";
import { kickSourcesAfterAdd } from "./knowledge-source-kick.js";
import { summarizeSourceAfterAdd } from "./knowledge-source-summary.starter.js";
import { fetchWithTimeout, truncateText } from "../shared/outbound-fetch.js";
import { extractArticleText } from "./article-text.js";
import {
  MAX_PAGE_TITLE_CHARS,
  MAX_PAGE_URL_CHARS,
  highlightsForStoredText,
  safePageUrl,
  withPageTitle,
} from "./knowledge-source-page-context.js";
import {
  findEarlierSourceByUrl,
  findEarlierSourcesByText,
  type EarlierKnowledgeSource,
} from "./knowledge-source-duplicate.repo.js";
import { addSplitSources, findEarlierSplitImport } from "./knowledge-source-split-add.js";
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
  targetPhrases: targetPhrasesSchema.optional(),
  highlights: knowledgeHighlightsSchema.optional(),
  sourceUrl: z.string().max(MAX_PAGE_URL_CHARS).optional(),
  title: z.string().max(MAX_PAGE_TITLE_CHARS).optional(),
});
const batchTextInput = z.object({
  texts: z.array(z.string().max(KNOWLEDGE_SOURCE_MAX_CHARS)).min(1),
  subjectId: subjectIdInput,
  modelId: modelIdInput,
  force: z.boolean().optional(),
  targetPhrases: targetPhrasesSchema.optional(),
});
const urlInput = z
  .object({
    url: z.string().url(),
    subjectId: subjectIdInput,
    modelId: modelIdInput,
    force: z.boolean().optional(),
    targetPhrases: targetPhrasesSchema.optional(),
  })
  .strict();

function addSource(
  text: string,
  subjectId: string | null,
  modelId: string | null,
  sourceUrl: string | null,
  targetPhrases: string[] | undefined,
  omitNullUrl = false,
  highlights?: KnowledgeHighlight[],
) {
  if (highlights && highlights.length > 0) {
    return insertKnowledgeSource(text, subjectId, modelId, sourceUrl, targetPhrases, highlights);
  }

  if (targetPhrases) return insertKnowledgeSource(text, subjectId, modelId, sourceUrl, targetPhrases);

  return omitNullUrl && sourceUrl === null
    ? insertKnowledgeSource(text, subjectId, modelId)
    : insertKnowledgeSource(text, subjectId, modelId, sourceUrl);
}

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
  let rawBody: Awaited<ReturnType<typeof readJsonBody<unknown>>>;

  try {
    rawBody = await readJsonBody(req, z.unknown());
  } catch (err) {
    if (!(err instanceof BodyTooLargeError)) throw err;

    sendJson(res, 413, {
      error: "invalid_input",
      message: describeKnowledgeSourceRefusal("text_too_long"),
      reason: "text_too_long",
    });

    return;
  }

  const isBatch = rawBody.ok && typeof rawBody.data === "object" && rawBody.data !== null && "texts" in rawBody.data;
  const isUrl = rawBody.ok && typeof rawBody.data === "object" && rawBody.data !== null && "url" in rawBody.data;

  if (isUrl) {
    const body = urlInput.safeParse(rawBody.ok ? rawBody.data : undefined);

    if (!body.success) return sendInvalidInputIssues(res, body.error);

    const subjectId = body.data.subjectId ?? null;

    if (await rejectSubject(res, subjectId)) return;

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

    const urlSource = await addSource(
      extractedText,
      subjectId,
      body.data.modelId ?? null,
      sourceUrl,
      body.data.targetPhrases,
    );
    await kickSourcesAfterAdd([urlSource.id]);
    await summarizeSourceAfterAdd(urlSource.id, extractedText);
    sendJson(res, 201, { ...urlSource, truncated });
    return;
  }

  if (isBatch) {
    const batchRaw = rawBody.ok ? rawBody.data : undefined;

    if (typeof batchRaw === "object" && batchRaw !== null && "highlights" in batchRaw) {
      return sendError(res, 400, "invalid_input", "highlights: not supported for batch adds");
    }

    const body = batchTextInput.safeParse(rawBody.ok ? rawBody.data : undefined);

    if (!body.success) {
      sendInvalidInputIssues(res, body.error);
      return;
    }

    const subjectId = body.data.subjectId ?? null;

    if (await rejectSubject(res, subjectId)) {
      return;
    }

    const trimmed = body.data.texts.map((text) => text.trim()).filter((text) => text.length > 0);
    const texts = body.data.force === true ? trimmed : [...new Set(trimmed)];

    if (texts.length === 0) return sendError(res, 400, "invalid_input", "texts: must not be empty");

    if (texts.length > MAX_SOURCES_PER_BATCH_ADD) {
      sendError(
        res,
        400,
        "invalid_input",
        `texts: must not exceed ${MAX_SOURCES_PER_BATCH_ADD} entries`,
      );
      return;
    }

    const earlierByText = body.data.force === true
      ? new Map<string, EarlierKnowledgeSource>()
      : await findEarlierSourcesByText(texts, subjectId);
    const repeated = texts.flatMap((text, index) => {
      const source = earlierByText.get(text);

      return source === undefined ? [] : [{ index, source }];
    });

    if (repeated.length > 0) {
      sendAlreadyAdded(res, repeated);
      return;
    }

    const batchSources = await insertKnowledgeSources(
      texts,
      subjectId,
      body.data.modelId ?? null,
      ...(body.data.targetPhrases ? [body.data.targetPhrases] : []),
    );
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

  const rawText = body.data.text;
  const text = rawText.trim();
  const leadingWhitespace = rawText.length - rawText.trimStart().length;

  if (text.length === 0) {
    sendError(res, 400, "invalid_input", "text: must not be empty");
    return;
  }

  const subjectId = body.data.subjectId ?? null;

  if (await rejectSubject(res, subjectId)) {
    return;
  }

  if (body.data.highlights !== undefined && !highlightsFitText(body.data.highlights, rawText.length)) {
    sendError(res, 400, "invalid_input", "highlights: range exceeds text length");
    return;
  }

  const pageUrl = safePageUrl(body.data.sourceUrl);
  const storedText = withPageTitle(text, body.data.title);
  const mergedHighlights = mergeHighlights(
    (body.data.highlights ?? [])
      .map((range) => ({
        start: Math.max(0, range.start - leadingWhitespace),
        end: Math.min(text.length, range.end - leadingWhitespace),
      }))
      .filter((range) => range.end > range.start),
  );
  const storedHighlights = highlightsForStoredText(mergedHighlights, body.data.title, storedText.length);
  const earlierSingle =
    body.data.force === true ? undefined : (await findEarlierSourcesByText([storedText], subjectId)).get(storedText);

  if (earlierSingle !== undefined) {
    sendAlreadyAdded(res, [{ source: earlierSingle }]);
    return;
  }

  if (storedHighlights.length > 0) {
    const earlierSplit = await findEarlierSplitImport({ text, subjectId, force: body.data.force === true });

    if (earlierSplit !== null) return sendAlreadyAdded(res, [{ source: earlierSplit }]);
  }

  const split =
    storedHighlights.length > 0
      ? null
      : await addSplitSources({
          text,
          title: body.data.title,
          subjectId,
          modelId: body.data.modelId ?? null,
          sourceUrl: pageUrl,
          targetPhrases: body.data.targetPhrases,
          force: body.data.force === true,
        });

  if (split?.kind === "duplicate") return sendAlreadyAdded(res, [{ source: split.earlier }]);

  if (split?.kind === "created") {
    const partIds = split.sources.map((part) => part.id);
    await kickSourcesAfterAdd(partIds);
    sendJson(res, 201, { ...split.sources[0], partIds });
    return;
  }

  const source = await addSource(
    storedText,
    subjectId,
    body.data.modelId ?? null,
    pageUrl,
    body.data.targetPhrases,
    true,
    storedHighlights,
  );
  await kickSourcesAfterAdd([source.id]);
  sendJson(res, 201, source);
}
