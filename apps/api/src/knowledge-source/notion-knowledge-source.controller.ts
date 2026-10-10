import type http from "node:http";
import { APIErrorCode, APIResponseError, isFullPage } from "@notionhq/client";
import type { Client, PageObjectResponse } from "@notionhq/client";
import { itemsFromDatabaseRows } from "@post-anki/core";
import { z } from "zod";
import { readJsonBody, sendJson } from "../shared/http.js";
import { getNotionClient } from "../notion-connector/notion.client.js";
import { insertKnowledgeSourcesFromNotion, MAX_ROWS_PER_IMPORT } from "./knowledge-source.repo.js";

// Notion ids are UUIDs, with or without dashes.
const NOTION_ID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const NOTION_PAGE_SIZE = 100;

const createKnowledgeSourceFromNotionInput = z.object({
  dataSourceId: z.string().trim().regex(NOTION_ID_PATTERN, "must be a Notion id"),
  startCursor: z.string().min(1).optional(),
});

// Only these codes mean the dataSourceId itself is bad — everything else
// (rate limits, Notion outages, bad tokens, our own bugs) re-throws to a real 500.
const BAD_DATA_SOURCE_ID_CODES: string[] = [
  APIErrorCode.ObjectNotFound,
  APIErrorCode.RestrictedResource,
  APIErrorCode.ValidationError,
  APIErrorCode.InvalidRequestURL,
];

function isBadDataSourceIdError(err: unknown): boolean {
  return err instanceof APIResponseError && BAD_DATA_SOURCE_ID_CODES.includes(err.code);
}

interface NotionRowsRead {
  rows: PageObjectResponse[];
  truncated: boolean;
  nextCursor: string | null;
}

// Reads whole Notion pages until the cap is crossed. When it is, the cursor
// returned is the one that fetched the page holding the first dropped row, so
// a resume re-reads that page (rows already imported are skipped by dedupe)
// and nothing between the cap and the next call is lost.
async function readRowsUpToCap(
  client: Client,
  dataSourceId: string,
  startCursor: string | undefined,
): Promise<NotionRowsRead> {
  const rows: PageObjectResponse[] = [];
  let pageCursor = startCursor;
  let hasMore = true;

  while (hasMore) {
    const page = await client.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: pageCursor,
      page_size: NOTION_PAGE_SIZE,
      sorts: [{ timestamp: "created_time", direction: "ascending" }],
    });

    if (page.request_status?.type === "incomplete") {
      throw new Error(`Notion query for data source ${dataSourceId} hit its per-query result limit`);
    }

    rows.push(...page.results.filter(isFullPage));

    if (rows.length > MAX_ROWS_PER_IMPORT) {
      return {
        rows: rows.slice(0, MAX_ROWS_PER_IMPORT),
        truncated: true,
        nextCursor: pageCursor ?? null,
      };
    }

    hasMore = page.has_more;

    if (hasMore) {
      if (!page.next_cursor) {
        throw new Error(`Notion reported more rows for data source ${dataSourceId} without a cursor`);
      }

      pageCursor = page.next_cursor;
    }
  }

  return { rows, truncated: false, nextCursor: null };
}

export async function handleCreateKnowledgeSourceFromNotion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, createKnowledgeSourceFromNotionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const { dataSourceId, startCursor } = body.data;

  let read: NotionRowsRead;

  try {
    read = await readRowsUpToCap(getNotionClient(), dataSourceId, startCursor);
  } catch (err) {
    if (!isBadDataSourceIdError(err)) {
      throw err;
    }

    sendJson(res, 400, {
      error: "invalid_notion_source",
      message: "dataSourceId: could not be read from Notion",
    });
    return;
  }

  const created = await insertKnowledgeSourcesFromNotion(
    itemsFromDatabaseRows(read.rows),
    dataSourceId,
  );

  sendJson(res, 200, {
    created: created.length,
    truncated: read.truncated,
    nextCursor: read.nextCursor,
  });
}
