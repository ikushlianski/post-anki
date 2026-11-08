import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { registerBrowseTools } from "./register-browse-tools.js";
import { registerCardsTools } from "./register-cards-tools.js";
import { registerSearchTools } from "./register-search-tools.js";
import { registerKnowledgeSourceTools } from "./register-knowledge-source-tools.js";
import { registerWriteTools } from "./register-write-tools.js";

export type McpAuthContext = RequestAuthContext;

// Stateless transport (mcp.route.ts) makes a fresh server per request, so
// this factory carries no per-connection state of its own; `auth` describes
// the credential behind the current request for tools that need a scope.
export function createMcpServer(auth: McpAuthContext): McpServer {
  const server = new McpServer({
    name: "post-anki-mcp",
    version: "0.1.0",
  });

  registerBrowseTools(server);
  registerCardsTools(server);
  registerSearchTools(server);
  registerKnowledgeSourceTools(server);
  registerWriteTools(server, auth);

  return server;
}
