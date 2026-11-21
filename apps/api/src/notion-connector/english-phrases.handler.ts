import type http from "node:http";
import type { KnowledgeSourceConnector } from "@post-anki/shared";
import { z } from "zod";
import { sendError, sendInvalidQuery, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { ensureSubjectPath, parseSubjectPath } from "../subject/subject-path.js";
import { fileKeyedNotes } from "../mcp/file-keyed-notes.js";
import { findSourcesByImportKeys, findSourcesByNormalizedText } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import { loadKnowledgeSourceConnectors } from "./connector-config.js";
import {
  importEnglishPhrases,
  NotionAccessError,
  type EnglishPhrasesDeps,
  type EnglishPhrasesResult,
} from "./english-phrases.sync.js";
import { deleteNotionBlock, listPhraseBlocksPage } from "./notion.client.js";
import { normalizeNote } from "./note-text.js";
import { insertImportLog, markImportDeleted } from "./notion-import-log.repo.js";

interface ImportQuery {
  limit?: number;
  dryRun?: boolean;
}

export type ConnectorOutcome =
  | { connector: string; result: EnglishPhrasesResult }
  | { connector: string; error: string; accessDenied: boolean };

const querySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  dryRun: z.enum(["1", "true"]).optional(),
});

export function realEnglishPhrasesDeps(subjectId: string): EnglishPhrasesDeps {
  return {
    listBlocks: listPhraseBlocksPage,
    findExisting: async (normalizedTexts) => {
      const rows = await findSourcesByNormalizedText(subjectId, normalizedTexts);
      const found = new Map<string, string>();

      for (const row of rows) {
        const normalized = normalizeNote(row.rawText);

        if (!found.has(normalized)) {
          found.set(normalized, row.id);
        }
      }

      return found;
    },
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
  connector: KnowledgeSourceConnector,
  query: ImportQuery,
  visited: Set<string> = new Set(),
): Promise<EnglishPhrasesResult> {
  const { subjectPath, maxWords, maxPhrases, recursive, deleteAfterImport } = connector.destination;
  const parsed = parseSubjectPath(subjectPath);

  if ("error" in parsed) {
    throw new Error(`Connector ${connector.name} has an invalid subject path`);
  }

  const subject = await ensureSubjectPath(parsed.segments);

  return importEnglishPhrases(realEnglishPhrasesDeps(subject.subjectId), {
    connector: connector.name,
    pageId: connector.source.id,
    maxWords: Math.min(query.limit ?? maxWords, maxWords),
    maxPhrases: Math.min(query.limit ?? maxPhrases, maxPhrases),
    recursive,
    deleteAfterImport,
    dryRun: query.dryRun ?? false,
    visited,
  });
}

export async function runAllEnglishPhrasesImports(query: ImportQuery): Promise<ConnectorOutcome[]> {
  const connectors = loadKnowledgeSourceConnectors().filter((connector) => connector.enabled);
  const outcomes: ConnectorOutcome[] = [];
  const visited = new Set<string>();

  for (const connector of connectors) {
    try {
      outcomes.push({ connector: connector.name, result: await runEnglishPhrasesImport(connector, query, visited) });
    } catch (err) {
      log.error({ err, connector: connector.name }, "notion_english_phrases_failed");
      outcomes.push({
        connector: connector.name,
        error: err instanceof Error ? err.message : String(err),
        accessDenied: err instanceof NotionAccessError,
      });
    }
  }

  return outcomes;
}

function toPublicOutcome(outcome: ConnectorOutcome): Record<string, unknown> {
  if ("result" in outcome) {
    return { ...outcome.result };
  }

  return { connector: outcome.connector, error: outcome.error };
}

export function failureStatus(outcomes: ConnectorOutcome[]): number {
  const failures = outcomes.filter((outcome) => "error" in outcome);

  if (failures.length === 0) {
    return 200;
  }

  return failures.some((outcome) => "accessDenied" in outcome && outcome.accessDenied) ? 403 : 502;
}

export async function handleNotionEnglishPhrases(res: http.ServerResponse, url: URL): Promise<void> {
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!query.success) {
    sendInvalidQuery(res, query.error);

    return;
  }

  try {
    const outcomes = await runAllEnglishPhrasesImports({
      limit: query.data.limit,
      dryRun: query.data.dryRun !== undefined,
    });

    sendJson(res, failureStatus(outcomes), { connectors: outcomes.map(toPublicOutcome) });
  } catch (err) {
    log.error({ err }, "notion_english_phrases_failed");
    sendError(res, 502, "notion_english_phrases_failed", "The import failed. Check the server logs.");
  }
}
