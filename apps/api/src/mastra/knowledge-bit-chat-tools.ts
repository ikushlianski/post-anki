import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { isSafeSourceUrl } from "@post-anki/core";

export interface KnowledgeBitChatToolsDeps {
  searchWeb: (query: string) => Promise<{ text: string; citations: string[] }>;
}

type SearchOutcome = { ok: true; text: string; citations: string[] };

export async function searchWebFor(
  input: { query: string },
  deps: KnowledgeBitChatToolsDeps,
): Promise<SearchOutcome> {
  const outcome = await deps.searchWeb(input.query);
  const citations = outcome.citations.filter((url) => isSafeSourceUrl(url).allowed);

  return { ok: true, text: outcome.text, citations };
}

export function createKnowledgeBitChatTools(deps: KnowledgeBitChatToolsDeps) {
  const searchWeb = createTool({
    id: "searchWeb",
    description:
      "Search the web for current, authoritative information to answer the learner's question. This is a paid call — use it only when the question genuinely needs up-to-date external facts that the knowledge item's own content cannot supply, never as a routine first step.",
    inputSchema: z.object({ query: z.string().min(1) }),
    execute: (input) => searchWebFor(input, deps),
  });

  return { searchWeb };
}
