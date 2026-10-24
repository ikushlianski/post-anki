import { describe, expect, it, vi } from "vitest";

import { showToast } from "./show-toast.js";

const message = { kind: "success", text: "Saved to Post Anki" } as const;

describe("showToast", () => {
  it("should inject the toast into the clicked tab", async () => {
    const executeScript = vi.fn().mockResolvedValue([]);

    await expect(showToast(7, message, { executeScript })).resolves.toBe(true);
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 7 }, args: [message] }),
    );
  });

  it("should fall back silently on pages where injection is blocked", async () => {
    const executeScript = vi.fn().mockRejectedValue(new Error("Cannot access a chrome:// URL"));

    await expect(showToast(7, message, { executeScript })).resolves.toBe(false);
  });

  it("should do nothing when the tab is unknown", async () => {
    const executeScript = vi.fn();

    await expect(showToast(undefined, message, { executeScript })).resolves.toBe(false);
    expect(executeScript).not.toHaveBeenCalled();
  });
});
