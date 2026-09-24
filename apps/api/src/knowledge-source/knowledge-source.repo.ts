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
