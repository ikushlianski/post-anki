import { getDb } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";
import { findSourcesByImportKeys } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import { newId } from "../shared/id.js";

const MANUAL_SOURCE_TEXT = "Cards added through MCP";

export function manualCardSourceKey(subjectId: string): string {
  return `mcp-manual-cards:${subjectId}`;
}

export async function getOrCreateManualCardSource(subjectId: string): Promise<string> {
  const importKey = manualCardSourceKey(subjectId);

  await getDb()
    .insert(knowledgeSources)
    .values({
      id: newId("ks"),
      kind: "prose",
      rawText: MANUAL_SOURCE_TEXT,
      status: "bits_detected",
      subjectId,
      importKey,
    })
    .onConflictDoNothing({ target: knowledgeSources.importKey });

  const [source] = await findSourcesByImportKeys([importKey]);

  if (!source) {
    throw new Error("manual card source missing after insert");
  }

  return source.id;
}
