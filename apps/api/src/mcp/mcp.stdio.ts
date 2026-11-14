process.env.LOG_TO_STDERR = "1";
console.log = console.error;
console.info = console.error;

const { assertDevDbIsLocal } = await import("../db/assert-dev-db-is-local.js");

assertDevDbIsLocal(process.env);

const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { fullAccessContext } = await import("../auth/request-auth-context.js");
const { createMcpServer } = await import("./mcp.server-factory.js");

await createMcpServer(fullAccessContext("shared_secret")).connect(new StdioServerTransport());

export {};
