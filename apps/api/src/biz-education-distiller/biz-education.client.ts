import { collectAllDataSourceRows, isFullPage } from "@notionhq/client";
import { isPaTagged, itemsFromDatabaseRows } from "@post-anki/core";
import { getNotionClient } from "../notion-connector/notion.client.js";

const DATA_SOURCE_ID = "3cddec4d-fc6e-805c-93ea-000bc235a121";
const MAX_ROWS = 20;

export interface BizEducationRow {
  id: string;
  text: string;
  tags: string[];
  createdTime: string;
}

interface DateProperty {
  type: string;
  date?: { start: string } | null;
}

function isSynced(properties: Record<string, unknown>): boolean {
  const property = properties["PostAnki Synced"] as DateProperty | undefined;

  return property?.type === "date" && Boolean(property.date);
}

export async function listUnsyncedTaggedRows(
  client = getNotionClient(),
): Promise<BizEducationRow[]> {
  const rows = (await collectAllDataSourceRows(client, { data_source_id: DATA_SOURCE_ID })).filter(
    isFullPage,
  );

  const unsynced = rows.filter((row) => !isSynced(row.properties));
  const items = itemsFromDatabaseRows(unsynced);
  const itemById = new Map(items.map((item) => [item.id, item]));

  return unsynced
    .filter((row) => isPaTagged(itemById.get(row.id)?.tags ?? []))
    .sort((a, b) => Date.parse(a.created_time) - Date.parse(b.created_time))
    .slice(0, MAX_ROWS)
    .map((row) => {
      const item = itemById.get(row.id)!;

      return { id: row.id, text: item.text, tags: item.tags, createdTime: row.created_time };
    });
}
