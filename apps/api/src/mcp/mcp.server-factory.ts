import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { log } from "../shared/log.js";
import { listDecks, listDecksInputSchema, listDecksResultSchema } from "./list-decks.tool.js";

// Logs the failure with the tool name and returns a generic error result,
// so a raw DB/driver message never reaches the client.
function withToolErrorHandling<Args>(
  toolName: string,
  handler: (args: Args) => Promise<CallToolResult>,
): (args: Args) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (error) {
      log.error({ err: error, tool: toolName }, "mcp_tool_failed");

      return {
        isError: true,
        content: [{ type: "text" as const, text: `Tool "${toolName}" failed.` }],
      };
    }
  };
}

// Stateless transport (mcp.route.ts) makes a fresh server per request, so
// this factory carries no per-connection state of its own.
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "post-anki-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "list_decks",
    {
      title: "List decks",
      description:
        "List the learner's language-practice decks (subjects whose kind is language-practice), read-only.",
      inputSchema: listDecksInputSchema.shape,
      outputSchema: listDecksResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("list_decks", async ({ limit, offset }) => {
      const result = await listDecks({ limit, offset });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );

  return server;
}
