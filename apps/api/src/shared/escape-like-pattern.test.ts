import { describe, expect, it } from "vitest";
import { escapeLikePattern } from "./escape-like-pattern.js";

describe("escapeLikePattern", () => {
  it("should make percent, underscore and backslash match themselves instead of acting as wildcards", () => {
    expect(escapeLikePattern("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
});
