import { describe, expect, it } from "vitest";
import { markGapResurfacedInput, triageGapInput } from "./gap";

describe("triageGapInput", () => {
  it("should accept each triage action", () => {
    for (const action of ["important", "defer", "dismiss", "revisit"]) {
      expect(triageGapInput.safeParse({ action }).success).toBe(true);
    }
  });

  it("should reject an unknown action", () => {
    expect(triageGapInput.safeParse({ action: "delete" }).success).toBe(false);
  });
});

describe("markGapResurfacedInput", () => {
  it("should accept a known kind and reject another", () => {
    expect(markGapResurfacedInput.safeParse({ kind: "deferral-expired" }).success).toBe(true);
    expect(markGapResurfacedInput.safeParse({ kind: "never" }).success).toBe(false);
  });
});
