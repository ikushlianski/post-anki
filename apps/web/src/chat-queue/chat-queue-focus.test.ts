import { describe, expect, it } from "vitest";

import { clampFocusIndex, moveFocusIndex } from "./chat-queue-focus";

describe("moveFocusIndex", () => {
  it("should start at the first card when j is pressed with nothing focused", () => {
    expect(moveFocusIndex(-1, 1, 3)).toBe(0);
  });

  it("should start at the last card when k is pressed with nothing focused", () => {
    expect(moveFocusIndex(-1, -1, 3)).toBe(2);
  });

  it("should stop at the ends instead of wrapping", () => {
    expect(moveFocusIndex(2, 1, 3)).toBe(2);
    expect(moveFocusIndex(0, -1, 3)).toBe(0);
  });

  it("should move one card at a time", () => {
    expect(moveFocusIndex(1, 1, 3)).toBe(2);
    expect(moveFocusIndex(1, -1, 3)).toBe(0);
  });

  it("should report no focus for an empty list", () => {
    expect(moveFocusIndex(0, 1, 0)).toBe(-1);
  });
});

describe("clampFocusIndex", () => {
  it("should pull focus back onto the last card when the list shrinks", () => {
    expect(clampFocusIndex(4, 2)).toBe(1);
  });

  it("should keep a valid index and clear focus on an empty list", () => {
    expect(clampFocusIndex(1, 3)).toBe(1);
    expect(clampFocusIndex(1, 0)).toBe(-1);
  });
});
