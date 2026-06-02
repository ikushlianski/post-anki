import { describe, it, expect } from "vitest";
import { createUpdateLru, isDuplicateUpdate } from "./update-lru.js";

describe("isDuplicateUpdate", () => {
  it("returns false on first sighting and true on the second", () => {
    const lru = createUpdateLru(4);
    expect(isDuplicateUpdate(100, lru)).toBe(false);
    expect(isDuplicateUpdate(100, lru)).toBe(true);
  });

  it("treats distinct update ids independently", () => {
    const lru = createUpdateLru(4);
    expect(isDuplicateUpdate(1, lru)).toBe(false);
    expect(isDuplicateUpdate(2, lru)).toBe(false);
    expect(isDuplicateUpdate(1, lru)).toBe(true);
    expect(isDuplicateUpdate(2, lru)).toBe(true);
  });

  it("evicts the oldest entry once capacity is exceeded", () => {
    const lru = createUpdateLru(2);
    expect(isDuplicateUpdate(1, lru)).toBe(false);
    expect(isDuplicateUpdate(2, lru)).toBe(false);
    expect(isDuplicateUpdate(3, lru)).toBe(false);
    expect(isDuplicateUpdate(1, lru)).toBe(false);
  });
});
