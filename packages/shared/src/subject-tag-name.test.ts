import { describe, expect, it } from "vitest";

import { createSubjectInput } from "./subject.js";
import { createTagInput } from "./tag.js";

describe.each([
  ["createSubjectInput", createSubjectInput],
  ["createTagInput", createTagInput],
])("%s name", (_label, schema) => {
  it("should reject a name made only of spaces", () => {
    expect(schema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("should reject a name longer than 120 characters", () => {
    expect(schema.safeParse({ name: "a".repeat(121) }).success).toBe(false);
  });

  it("should accept a name of exactly 120 characters", () => {
    expect(schema.safeParse({ name: "a".repeat(120) }).success).toBe(true);
  });

  it("should store a padded name trimmed", () => {
    expect(schema.parse({ name: "  Biology  " }).name).toBe("Biology");
  });
});
