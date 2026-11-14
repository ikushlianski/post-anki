import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(new URL("../../../../.mcp.json", import.meta.url), "utf8")) as {
  mcpServers: Record<string, Record<string, unknown>>;
};

describe(".mcp.json", () => {
  it("should register postanki-local as the only post-anki server, over stdio with no secrets", () => {
    expect(config.mcpServers["postanki-local"]).toEqual({
      type: "stdio",
      command: "npm",
      args: ["run", "-s", "mcp:stdio", "-w", "@post-anki/api"],
      env: { ALLOW_REMOTE_DEV_DB: "1" },
    });
    expect(Object.keys(config.mcpServers).sort()).toEqual(["mastra", "notion", "postanki-local"]);
  });
});
