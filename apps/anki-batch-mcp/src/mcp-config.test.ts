import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(new URL("../../../.mcp.json", import.meta.url), "utf8")) as {
  mcpServers: Record<string, Record<string, unknown>>;
};

describe(".mcp.json", () => {
  it("should register anki-batch as a stdio server without secrets", () => {
    expect(config.mcpServers["anki-batch"]).toEqual({
      type: "stdio",
      command: "npx",
      args: ["tsx", "apps/anki-batch-mcp/src/anki-batch-mcp.server.ts", "subjects/Business.txt"],
    });
  });

  it("should read the prod bearer from POST_ANKI_MCP_TOKEN and carry no literal token", () => {
    expect(config.mcpServers["post-anki-prod"]).toEqual({
      type: "http",
      url: "https://post-anki-api-pl6jw2mdla-ew.a.run.app/mcp",
      headers: { Authorization: "Bearer ${POST_ANKI_MCP_TOKEN}" },
    });
    expect(readFileSync(new URL("../../../.mcp.json", import.meta.url), "utf8")).not.toContain("pat_");
  });

  it("should keep the mastra and notion servers", () => {
    expect(config.mcpServers.mastra).toBeDefined();
    expect(config.mcpServers.notion).toBeDefined();
  });
});
