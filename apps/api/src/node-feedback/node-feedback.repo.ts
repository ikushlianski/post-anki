import { and, desc, eq } from "drizzle-orm";
import type { NodeFeedback, NodeType } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { nodeFeedback } from "../db/schema.js";
import { newId } from "../shared/id.js";

function rowToNodeFeedback(row: typeof nodeFeedback.$inferSelect): NodeFeedback {
  return {
    id: row.id,
    nodeType: row.nodeType as NodeType,
    nodeId: row.nodeId,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertNodeComment(
  nodeType: NodeType,
  nodeId: string,
  comment: string,
): Promise<NodeFeedback> {
  const row = {
    id: newId("nfb"),
    nodeType,
    nodeId,
    comment,
  };

  await getDb().insert(nodeFeedback).values(row);

  return rowToNodeFeedback({ ...row, createdAt: new Date() });
}

export async function listNodeComments(
  nodeType: NodeType,
  nodeId: string,
): Promise<NodeFeedback[]> {
  const rows = await getDb()
    .select()
    .from(nodeFeedback)
    .where(
      and(eq(nodeFeedback.nodeType, nodeType), eq(nodeFeedback.nodeId, nodeId)),
    )
    .orderBy(desc(nodeFeedback.createdAt));

  return rows.map(rowToNodeFeedback);
}
