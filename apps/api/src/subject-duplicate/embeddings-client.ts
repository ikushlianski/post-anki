import { embedTexts } from "../shared/embeddings-client.js";

export interface EmbedSubjectTextsItem {
  id: string;
  text: string;
}

export interface EmbeddedSubjectResult {
  id: string;
  embedding: number[];
}

// Thin wrapper — the real logic lives in apps/api/src/shared/embeddings-client.ts.
export async function embedSubjectTexts(
  items: EmbedSubjectTextsItem[],
): Promise<EmbeddedSubjectResult[]> {
  return embedTexts(items);
}
