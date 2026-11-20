import type http from "node:http";
import { z } from "zod";
import { sendError, sendInvalidQuery, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { ensureSubjectPath, parseSubjectPath } from "../subject/subject-path.js";
import { fileKeyedNotes } from "../mcp/file-keyed-notes.js";
import { findSourcesByImportKeys } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import { loadKnowledgeSourceConnectors } from "./connector-config.js";
import {
  importEnglishPhrases,
  NotionAccessError,
  type EnglishPhrasesDeps,
  type EnglishPhrasesResult,
} from "./english-phrases.sync.js";
import { deleteNotionBlock, listPhraseBlocks } from "./notion.client.js";
import { insertImportLog, markImportDeleted } from "./notion-import-log.repo.js";

const CONNECTOR_NAME = "english-phrases-3";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  dryRun: z.enum(["1", "true"]).optional(),
});

export function realEnglishPhrasesDeps(subjectId: string): EnglishPhrasesDeps {
  return {
    listBlocks: listPhraseBlocks,
    fileNote: async (key, text) => {
      const filed = await fileKeyedNotes([{ key, text }], subjectId);
      const [source] = await findSourcesByImportKeys([key]);

      if (!source) {
        throw new Error(`Knowledge source for ${key} not found after filing`);
      }

      return { sourceId: source.id, created: filed.created > 0 };
    },
    logImport: insertImportLog,
    markDeleted: markImportDeleted,
    deleteBlock: deleteNotionBlock,
    now: () => new Date(),
  };
}

export async function runEnglishPhrasesImport(
  query: { limit?: number; dryRun?: boolean },
): Promise<EnglishPhrasesResult> {
  const connector = loadKnowledgeSourceConnectors().find((candidate) => candidate.name === CONNECTOR_NAME);

  if (!connector || !connector.enabled) {
    throw new Error(`Connector ${CONNECTOR_NAME} is missing or disabled`);
  }

  const { subjectPath, maxPerRun, deleteAfterImport } = connector.destination;
  const parsed = parseSubjectPath(subjectPath);

  if ("error" in parsed) {
    throw new Error(`Connector ${CONNECTOR_NAME} has an invalid subject path`);
  }

  const subject = await ensureSubjectPath(parsed.segments);

  return importEnglishPhrases(realEnglishPhrasesDeps(subject.subjectId), {
    connector: connector.name,
    pageId: connector.source.id,
    maxPerRun: Math.min(query.limit ?? maxPerRun, maxPerRun),
    deleteAfterImport,
    dryRun: query.dryRun ?? false,
  });
}

export async function handleNotionEnglishPhrases(res: http.ServerResponse, url: URL): Promise<void> {
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!query.success) {
    sendInvalidQuery(res, query.error);

    return;
  }

  try {
    sendJson(res, 200, await runEnglishPhrasesImport({ limit: query.data.limit, dryRun: query.data.dryRun !== undefined }));
  } catch (err) {
    log.error({ err }, "notion_english_phrases_failed");

    if (err instanceof NotionAccessError) {
      sendError(res, 403, "notion_access_denied", err.message);

      return;
    }

    sendError(res, 502, "notion_english_phrases_failed", "The import failed. Check the server logs.");
  }
}
