import type http from "node:http";
import { APIErrorCode, APIResponseError, isFullPage, iterateAllDataSourceRows } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client";
import { itemsFromDatabaseRows } from "@post-anki/core";
import { z } from "zod";
import { readJsonBody, sendJson } from "../shared/http.js";
import { getNotionClient } from "../notion-connector/notion.client.js";
import { insertKnowledgeSourcesFromNotion, MAX_ROWS_PER_IMPORT } from "./knowledge-source.repo.js";

const createKnowledgeSourceFromNotionInput = z.object({
  dataSourceId: z.string(),
});

// Only these codes mean the dataSourceId itself is bad — everything else
// (rate limits, Notion outages, our own bugs) re-throws to a real 500.
const BAD_DATA_SOURCE_ID_CODES: string[] = [
  APIErrorCode.ObjectNotFound,
  APIErrorCode.Unauthorized,
  APIErrorCode.RestrictedResource,
  APIErrorCode.ValidationError,
  APIErrorCode.InvalidRequestURL,
];

function isBadDataSourceIdError(err: unknown): boolean {
  return err instanceof APIResponseError && BAD_DATA_SOURCE_ID_CODES.includes(err.code);
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

  const dataSourceId = body.data.dataSourceId.trim();

  if (dataSourceId.length === 0) {
    sendJson(res, 400, { error: "invalid_input", message: "dataSourceId: must not be empty" });
    return;
  }

  let items: ReturnType<typeof itemsFromDatabaseRows>;
  let truncated = false;

  try {
    // Stop reading at MAX_ROWS_PER_IMPORT + 1 instead of crawling the whole
    // database first and capping afterwards.
    const client = getNotionClient();
    const rows: PageObjectResponse[] = [];

    for await (const row of iterateAllDataSourceRows(client, { data_source_id: dataSourceId })) {
      if (isFullPage(row)) {
        rows.push(row);
      }

      if (rows.length > MAX_ROWS_PER_IMPORT) {
        truncated = true;
        break;
      }
    }

    items = itemsFromDatabaseRows(truncated ? rows.slice(0, MAX_ROWS_PER_IMPORT) : rows);
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

  const created = await insertKnowledgeSourcesFromNotion(items, dataSourceId);

  sendJson(res, 200, { created: created.length, truncated });
}
