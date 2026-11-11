import { describe, expect, it, vi } from "vitest";

import { readSelection } from "./read-selection.js";

describe("readSelection", () => {
  it("should return the fenced text read from the page", async () => {
    const executeScript = vi.fn().mockResolvedValue([{ result: "```ts\nlet a = 1;\n```" }]);

    await expect(readSelection(3, { executeScript })).resolves.toBe("```ts\nlet a = 1;\n```");
  });

  it("should fall back to the plain selection when the page has no code or cannot be scripted", async () => {
    await expect(readSelection(3, { executeScript: vi.fn().mockResolvedValue([{ result: null }]) })).resolves.toBeNull();
    await expect(readSelection(3, { executeScript: vi.fn().mockRejectedValue(new Error("blocked")) })).resolves.toBeNull();
    await expect(readSelection(undefined, { executeScript: vi.fn() })).resolves.toBeNull();
  });
});
