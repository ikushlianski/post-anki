import { describe, expect, it } from "vitest";
import { isComplete } from "./is-complete";

describe("isComplete — the single completion check reused for curricula and Areas", () => {
  it("is not complete below 100 percent", () => {
    expect(isComplete(99)).toBe(false);
  });

  it("is complete at exactly 100 percent", () => {
    expect(isComplete(100)).toBe(true);
  });

  it("treats a freshly-created entity with no progress as not complete", () => {
    expect(isComplete(0)).toBe(false);
  });

  // moduleProgress/domainNodeProgress round to the nearest integer before
  // this deriver ever sees the number (Math.round in packages/core/src/
  // curriculum/progress.ts). Reusing that rollup unmodified, per spec.md,
  // means a curriculum averaging 99.5 topic maturity rounds up to 100 and
  // awards here — this is a deliberate consequence of "never a second
  // progress formula", not an off-by-one bug, and is pinned by this test so
  // it stays a recorded decision rather than an accident.
  it("awards at a rounded 100 even though the underlying average was 99.5", () => {
    expect(isComplete(Math.round(99.5))).toBe(true);
  });
});
