import type http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { log } from "../shared/log.js";
import { createMcpServer } from "./mcp.server-factory.js";

// Stateless Streamable HTTP — Cloud Run scales to zero, so no in-memory
// session survives a cold start; every request gets its own server+transport.
export async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const server = createMcpServer();

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    log.error({ err }, "mcp_request_failed");

    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        }),
      );
    }
  }
}

// A stateless server has no session stream to resume or close.
export function handleMcpMethodNotAllowed(res: http.ServerResponse): void {
  res
    .writeHead(405, { "content-type": "application/json", allow: "POST" })
    .end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      }),
    );
}
