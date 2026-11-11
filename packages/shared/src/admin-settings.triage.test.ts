import { describe, expect, it } from "vitest";
import { DEFAULT_TRIAGE_ENABLED, updateAdminSettingsInput } from "./admin-settings";
import { pendingKnowledgeBitReviewCountResponse } from "./knowledge-bit";

describe("triage setting contract", () => {
  it("should default to off so new cards go straight into their subject", () => {
    expect(DEFAULT_TRIAGE_ENABLED).toBe(false);
  });

  it("should let a settings update leave triage out", () => {
    expect(updateAdminSettingsInput.parse({}).triageEnabled).toBeUndefined();
  });

  it("should treat a count response without the flag as triage off", () => {
    expect(pendingKnowledgeBitReviewCountResponse.parse({ count: 0 }).triageEnabled).toBe(false);
  });
});
