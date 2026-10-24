import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBrowseTools } from "./register-browse-tools.js";
import { registerCardsTools } from "./register-cards-tools.js";
import { registerSearchTools } from "./register-search-tools.js";
import { registerKnowledgeSourceTools } from "./register-knowledge-source-tools.js";

// Stateless transport (mcp.route.ts) makes a fresh server per request, so
// this factory carries no per-connection state of its own.
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "post-anki-mcp",
    version: "0.1.0",
  });

  registerBrowseTools(server);
  registerCardsTools(server);
  registerSearchTools(server);
  registerKnowledgeSourceTools(server);

  return server;
}
