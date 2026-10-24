import { describe, expect, it, vi } from "vitest";

import { openReviewTab } from "./open-review-tab.js";

describe("openReviewTab", () => {
  it("should open the approval screen on the web origin in a new tab", () => {
    const createTab = vi.fn();

    openReviewTab("http://localhost:5540", createTab);

    expect(createTab).toHaveBeenCalledWith({ url: "http://localhost:5540/knowledge-bit-review" });
  });
});
