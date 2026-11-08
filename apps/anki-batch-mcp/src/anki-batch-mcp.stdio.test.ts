import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

describe("anki-batch stdio entry", () => {
  it("should start over stdio and list its three tools", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "anki-stdio-")), "export.txt");

    copyFileSync(new URL("./test-fixtures/small-export.txt", import.meta.url), file);

    const client = new Client({ name: "test", version: "0.0.0" });
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", "src/anki-batch-mcp.server.ts", file],
      cwd: new URL("..", import.meta.url).pathname,
      stderr: "pipe",
    });

    await client.connect(transport);

    try {
      const { tools } = await client.listTools();

      expect(tools.map((tool) => tool.name).sort()).toEqual(["confirm_batch", "get_next_batch", "status"]);
    } finally {
      await client.close();
    }
  }, 30_000);
});
