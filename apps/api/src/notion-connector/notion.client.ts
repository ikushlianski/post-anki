import {
  Client,
  collectAllDataSourceRows,
  collectPaginatedAPI,
  extractNotionId,
  isFullBlock,
  isFullPage,
} from "@notionhq/client";
import type { NotionItem, NotionSource } from "@post-anki/shared";
import { itemsFromBlocks, itemsFromDatabaseRows } from "@post-anki/core";
import { loadEnv } from "../shared/env.js";

let cached: Client | undefined;

export function getNotionClient(): Client {
  if (cached) {
    return cached;
  }

  const { NOTION_TOKEN } = loadEnv();

  if (!NOTION_TOKEN) {
    throw new Error("NOTION_TOKEN is not set");
  }

  cached = new Client({ auth: NOTION_TOKEN });

  return cached;
}

function idFrom(source: NotionSource): string {
  const id = extractNotionId(source.id);

  if (!id) {
    throw new Error(`Not a Notion id or URL: ${source.id}`);
  }

  return id;
}

export async function listPageBlocks(pageId: string, client = getNotionClient()) {
  const blocks = await collectPaginatedAPI(client.blocks.children.list, { block_id: pageId });

  return blocks.filter(isFullBlock);
}

export async function queryDatabase(databaseId: string, client = getNotionClient()) {
  const database = await client.databases.retrieve({ database_id: databaseId });
  const dataSource = "data_sources" in database ? database.data_sources[0] : undefined;

  if (!dataSource) {
    throw new Error(`Notion database ${databaseId} has no data source`);
  }

  const rows = await collectAllDataSourceRows(client, { data_source_id: dataSource.id });

  return rows.filter(isFullPage);
}

export async function readSourceItems(
  source: NotionSource,
  client = getNotionClient(),
): Promise<NotionItem[]> {
  const id = idFrom(source);

  if (source.kind === "page") {
    return itemsFromBlocks(await listPageBlocks(id, client));
  }

  return itemsFromDatabaseRows(await queryDatabase(id, client));
}
