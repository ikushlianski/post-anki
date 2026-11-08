import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  confirmBatchInputSchema,
  confirmBatchResultSchema,
  createAnkiBatchTools,
  getNextBatchInputSchema,
  getNextBatchResultSchema,
  statusInputSchema,
  statusResultSchema,
} from "./anki-batch-tools.js";
import { createBatchFileStore } from "./batch-file-store.js";
import { createBatchSession } from "./batch-session.js";

export function createAnkiBatchServer(filePath: string): McpServer {
  const server = new McpServer({ name: "anki-batch", version: "0.0.0" });
  const tools = createAnkiBatchTools(filePath, createBatchFileStore(filePath), createBatchSession());

  server.registerTool(
    "get_next_batch",
    {
      title: "Get next batch",
      description:
        "Back up the export once and hand out the next notes with a batch id. Notes stay in the file until confirm_batch.",
      inputSchema: getNextBatchInputSchema.shape,
      outputSchema: getNextBatchResultSchema.shape,
      annotations: { readOnlyHint: false },
    },
    async ({ size }) => {
      const result = await tools.getNextBatch(size);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    },
  );

  server.registerTool(
    "confirm_batch",
    {
      title: "Confirm batch",
      description: "Remove the notes of a handed-out batch from the export file. Refuses unknown or repeated ids.",
      inputSchema: confirmBatchInputSchema.shape,
      outputSchema: confirmBatchResultSchema.shape,
      annotations: { readOnlyHint: false },
    },
    async ({ batchId }) => {
      const outcome = await tools.confirmBatch(batchId);

      if (!outcome.ok) {
        return { isError: true, content: [{ type: "text" as const, text: outcome.message }] };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(outcome.result) }],
        structuredContent: { ...outcome.result },
      };
    },
  );

  server.registerTool(
    "status",
    {
      title: "Status",
      description: "Report the export file, whether the backup exists, notes remaining and open batches.",
      inputSchema: statusInputSchema.shape,
      outputSchema: statusResultSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await tools.status();

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    },
  );

  return server;
}
