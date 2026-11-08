import { accessSync, constants } from "node:fs";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAnkiBatchServer } from "./anki-batch.server-factory.js";

const argument = process.argv[2];

if (!argument) {
  process.stderr.write("Usage: anki-batch-mcp <path-to-anki-export>\n");
  process.exit(1);
}

const filePath = resolve(process.cwd(), argument);

try {
  accessSync(filePath, constants.R_OK | constants.W_OK);
} catch {
  process.stderr.write(`Cannot read or write export file: ${filePath}\n`);
  process.exit(1);
}

await createAnkiBatchServer(filePath).connect(new StdioServerTransport());
