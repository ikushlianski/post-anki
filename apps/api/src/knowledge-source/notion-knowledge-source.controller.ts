import type http from "node:http";
import { collectAllDataSourceRows, isFullPage } from "@notionhq/client";
import { itemsFromDatabaseRows } from "@post-anki/core";
import { z } from "zod";
import { readJsonBody, sendJson } from "../shared/http.js";
import { getNotionClient } from "../notion-connector/notion.client.js";
import { insertKnowledgeSourcesFromNotion } from "./knowledge-source.repo.js";

const createKnowledgeSourceFromNotionInput = z.object({
  dataSourceId: z.string(),
});

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

  try {
    const rows = (
      await collectAllDataSourceRows(getNotionClient(), { data_source_id: dataSourceId })
    ).filter(isFullPage);

    items = itemsFromDatabaseRows(rows);
  } catch {
    // A bad/inaccessible dataSourceId, or a Notion-side error, is a client
    // input problem from this endpoint's perspective — not a server bug —
    // so it gets a 4xx, same as any other invalid_input case here.
    sendJson(res, 400, {
      error: "invalid_notion_source",
      message: "dataSourceId: could not be read from Notion",
    });
    return;
  }

  const created = await insertKnowledgeSourcesFromNotion(items, dataSourceId);

  sendJson(res, 200, { created: created.length });
}
