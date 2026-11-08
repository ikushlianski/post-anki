import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  searchKnowledgeItems,
  searchKnowledgeItemsInputSchema,
  searchKnowledgeItemsResultSchema,
} from "./search-knowledge-items.tool.js";
import {
  checkDuplicates,
  checkDuplicatesInputSchema,
  checkDuplicatesResultSchema,
} from "./check-duplicates.tool.js";
import { withToolErrorHandling } from "./tool-error-handling.js";

// Cross-content search and duplicate check: search_knowledge_items, check_duplicates.
export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    "search_knowledge_items",
    {
      title: "Search knowledge items",
      description:
        "Search ready study cards by concept/prompt/answer text, plus matching course and topic names, topic/module titles and knowledge-bit text by full-text relevance, and tag names across topics, modules, and knowledge bits, read-only.",
      inputSchema: searchKnowledgeItemsInputSchema.shape,
      outputSchema: searchKnowledgeItemsResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("search_knowledge_items", async ({ query, limit }) => {
      const result = await searchKnowledgeItems({ query, limit });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );

  server.registerTool(
    "check_duplicates",
    {
      title: "Check duplicates",
      description:
        "For up to 100 draft note texts, report which already exist as knowledge sources, knowledge bits or ready study cards, so they can be skipped before submit_knowledge. Each match carries match: \"exact\" (identical text or import key) or \"normalized\" (text differs only in case, whitespace or punctuation). Normalized matching is skipped for drafts shorter than 12 letters/digits once normalized, to avoid false hits; those only match exactly. Optionally limited to one subject, read-only.",
      inputSchema: checkDuplicatesInputSchema.shape,
      outputSchema: checkDuplicatesResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("check_duplicates", async ({ drafts, subjectId }) => {
      const result = await checkDuplicates({ drafts, subjectId });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );
}
