import { describe, expect, it } from "vitest";

import { interleaveNewWithSeen } from "./knowledge-bit-review-queue-mix.js";

describe("interleaveNewWithSeen", () => {
  it("should alternate a seen card and a new card while both kinds remain", () => {
    expect(interleaveNewWithSeen(["s1", "s2", "s3"], ["n1", "n2", "n3"], 10)).toEqual([
      "s1",
      "n1",
      "s2",
      "n2",
      "s3",
      "n3",
    ]);
  });

  it("should keep showing the remaining kind once the other runs out", () => {
    expect(interleaveNewWithSeen(["s1"], ["n1", "n2", "n3"], 10)).toEqual(["s1", "n1", "n2", "n3"]);
    expect(interleaveNewWithSeen(["s1", "s2", "s3"], ["n1"], 10)).toEqual(["s1", "n1", "s2", "s3"]);
  });

  it("should never return more cards than the batch limit", () => {
    expect(interleaveNewWithSeen(["s1", "s2"], ["n1", "n2"], 3)).toEqual(["s1", "n1", "s2"]);
  });

  it("should return nothing when there are no cards", () => {
    expect(interleaveNewWithSeen([], [], 5)).toEqual([]);
  });
});
