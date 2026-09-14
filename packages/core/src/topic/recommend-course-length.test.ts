import { describe, it, expect } from "vitest";
import { recommendCourseLength } from "./recommend-course-length.js";

describe("recommendCourseLength", () => {
  it("recommends a short course when most topics already tested deep or working", () => {
    const result = recommendCourseLength(["deep", "working", "deep", "awareness"]);

    expect(result.recommendation).toBe("short");
    expect(result.alreadyKnownRatio).toBe(0.75);
  });

  it("recommends a long course when most topics tested only awareness", () => {
    const result = recommendCourseLength(["awareness", "awareness", "working"]);

    expect(result.recommendation).toBe("long");
  });

  it("recommends a long course when no topic was elected at all", () => {
    const result = recommendCourseLength([]);

    expect(result.recommendation).toBe("long");
    expect(result.alreadyKnownRatio).toBe(0);
  });

  it("treats the threshold itself as short", () => {
    const result = recommendCourseLength(["deep", "deep", "deep", "awareness", "awareness"]);

    expect(result.alreadyKnownRatio).toBe(0.6);
    expect(result.recommendation).toBe("short");
  });
});
