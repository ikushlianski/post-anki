import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { log } from "../shared/log.js";

// Logs the failure with the tool name and returns a generic error result,
// so a raw DB/driver message never reaches the client.
export function withToolErrorHandling<Args>(
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
