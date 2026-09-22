import { getNotionClient } from "../notion-connector/notion.client.js";

export async function markRowSynced(
  pageId: string,
  client = getNotionClient(),
  today = () => new Date().toISOString().slice(0, 10),
): Promise<void> {
  await client.pages.update({
    page_id: pageId,
    properties: { "PostAnki Synced": { date: { start: today() } } },
  });
}
