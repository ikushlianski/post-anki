import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  searchKnowledgeItems,
  searchKnowledgeItemsInputSchema,
  searchKnowledgeItemsResultSchema,
} from "./search-knowledge-items.tool.js";
import { withToolErrorHandling } from "./tool-error-handling.js";

// Cross-content search: search_knowledge_items.
export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    "search_knowledge_items",
    {
      title: "Search knowledge items",
      description:
        "Search ready study cards by concept/prompt/answer text, plus matching course and topic names, read-only.",
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
}
