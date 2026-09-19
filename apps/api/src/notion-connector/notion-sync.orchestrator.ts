import type { NotionConnector, NotionItem, NotionSource } from "@post-anki/shared";
import { filterByTag } from "@post-anki/core";
import { log } from "../shared/log.js";
import { embedFacts } from "../facts/facts-embedding.orchestrator.js";
import { getNotionClient, readSourceItems } from "./notion.client.js";
import { insertFact, listSyncedNotionIds, recordSynced } from "./notion-sync.repo.js";
import { addProjectTodo, type ProjectTodoTarget } from "./project-todo.destination.js";

export interface NotionSyncDeps {
  readItems: (source: NotionSource) => Promise<NotionItem[]>;
  addTodo: (target: ProjectTodoTarget, text: string) => Promise<void>;
  removeItem: (source: NotionSource, itemId: string) => Promise<void>;
}

export interface ConnectorSyncResult {
  connector: string;
  imported: number;
  skipped: number;
  failed: number;
}

export async function removeNotionItem(source: NotionSource, itemId: string): Promise<void> {
  const client = getNotionClient();

  if (source.kind === "page") {
    await client.blocks.delete({ block_id: itemId });
    return;
  }

  await client.pages.update({ page_id: itemId, archived: true });
}

export function defaultNotionSyncDeps(): NotionSyncDeps {
  return { readItems: readSourceItems, addTodo: addProjectTodo, removeItem: removeNotionItem };
}

async function routeItem(connector: NotionConnector, item: NotionItem, deps: NotionSyncDeps): Promise<void> {
  const { destination } = connector;

  if (destination.kind === "fact") {
    await insertFact({ body: item.text, source: "notion", sourceRef: `notion:${item.id}`, tags: item.tags });
  } else {
    await deps.addTodo({ file: destination.file, direction: destination.direction }, item.text);
  }

  await recordSynced(item.id, connector.name, destination.kind);

  if (connector.removeAfterImport) {
    await deps.removeItem(connector.source, item.id);
  }
}

export async function syncConnector(
  connector: NotionConnector,
  deps: NotionSyncDeps,
): Promise<ConnectorSyncResult> {
  const tagged = filterByTag(await deps.readItems(connector.source), connector.tag);
  const alreadySynced = await listSyncedNotionIds(tagged.map((item) => item.id));
  const result: ConnectorSyncResult = { connector: connector.name, imported: 0, skipped: 0, failed: 0 };

  for (const item of tagged) {
    if (alreadySynced.has(item.id)) {
      result.skipped += 1;
      continue;
    }

    try {
      await routeItem(connector, item, deps);
      result.imported += 1;
    } catch (err) {
      result.failed += 1;
      log.error({ err, connector: connector.name, notionId: item.id }, "notion_sync_item_failed");
    }
  }

  log.info(result, "notion_sync_connector_done");

  return result;
}

export async function runNotionSync(
  connectors: NotionConnector[],
  deps: NotionSyncDeps = defaultNotionSyncDeps(),
): Promise<ConnectorSyncResult[]> {
  const results: ConnectorSyncResult[] = [];

  for (const connector of connectors) {
    try {
      results.push(await syncConnector(connector, deps));
    } catch (err) {
      log.error({ err, connector: connector.name }, "notion_sync_connector_failed");
      results.push({ connector: connector.name, imported: 0, skipped: 0, failed: -1 });
    }
  }

  await embedFacts().catch((err) => log.error({ err }, "facts_embedding_failed"));

  return results;
}
