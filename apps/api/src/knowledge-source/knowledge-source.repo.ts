import { getDb } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface KnowledgeSource {
  id: string;
  kind: string;
  rawText: string | null;
  status: string;
  createdAt: Date;
}

export async function insertKnowledgeSource(rawText: string): Promise<KnowledgeSource> {
  const row = {
    id: newId("ks"),
    kind: "prose",
    rawText,
    status: "pending",
  };

  await getDb().insert(knowledgeSources).values(row);

  return {
    ...row,
    createdAt: new Date(),
  };
}

// Caps a single import so one call can't crawl an unbounded Notion database
// into an unbounded batch of pending rows (and an unbounded downstream
// bit-detection/LLM cost) — matches the spirit of biz-education's own
// MAX_ROWS cap, just sized for a one-shot user-triggered import rather than
// a recurring 20-row sync poll.
const MAX_ROWS_PER_IMPORT = 500;

export async function insertKnowledgeSourcesFromNotion(
  items: { id: string; text: string }[],
  dataSourceId: string,
): Promise<KnowledgeSource[]> {
  if (items.length === 0) {
    return [];
  }

  const capped = items.slice(0, MAX_ROWS_PER_IMPORT);

  const rows = capped.map((item) => ({
    id: newId("ks"),
    kind: "notion",
    rawText: item.text,
    status: "pending",
    notionDatabaseId: dataSourceId,
    notionPageId: item.id,
  }));

  // notionPageId is unique, so re-importing the same database skips rows
  // already pulled in by an earlier call instead of duplicating them.
  const inserted = await getDb()
    .insert(knowledgeSources)
    .values(rows)
    .onConflictDoNothing({ target: knowledgeSources.notionPageId })
    .returning();

  return inserted.map((row) => ({ ...row, createdAt: row.createdAt ?? new Date() }));
}
