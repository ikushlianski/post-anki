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

export async function listUnsyncedTaggedRows(
  client = getNotionClient(),
): Promise<BizEducationRow[]> {
  const rows = (
    await collectAllDataSourceRows(client, {
      data_source_id: DATA_SOURCE_ID,
      filter: {
        and: [
          { property: "PostAnki Synced", date: { is_empty: true } },
          { property: "Tags", multi_select: { contains: "PA" } },
        ],
      },
    })
  ).filter(isFullPage);

  const items = itemsFromDatabaseRows(rows);
  const itemById = new Map(items.map((item) => [item.id, item]));

  return rows
    .filter((row) => isPaTagged(itemById.get(row.id)?.tags ?? []))
    .sort((a, b) => Date.parse(a.created_time) - Date.parse(b.created_time))
    .slice(0, MAX_ROWS)
    .map((row) => {
      const item = itemById.get(row.id)!;

      return { id: row.id, text: item.text, tags: item.tags, createdTime: row.created_time };
    });
}
