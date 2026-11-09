import { describe, expect, it } from "vitest";

import { isMovableApprovalState } from "./knowledge-bit-move-rules.js";

describe("isMovableApprovalState", () => {
  it.each(["pending", "approved", "inbox", "chat"])(
    "should let a %s item change subject so triage can reassign it before approval",
    (state) => {
      expect(isMovableApprovalState(state)).toBe(true);
    },
  );

  it.each(["rejected", "superseded"])("should keep a %s item where it is", (state) => {
    expect(isMovableApprovalState(state)).toBe(false);
  });
});
