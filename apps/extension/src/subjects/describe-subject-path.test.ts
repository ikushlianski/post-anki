import { describe, expect, it } from "vitest";

import { describeSubjectPath } from "./describe-subject-path.js";

const subjects = [
  { id: "sys", name: "Systems" },
  { id: "hl", name: "High-load", parentId: "sys" },
  { id: "cache", name: "Caching", parentId: "hl" },
  { id: "orphan", name: "Orphan", parentId: "gone" },
  { id: "a", name: "A", parentId: "b" },
  { id: "b", name: "B", parentId: "a" },
];

describe("describeSubjectPath", () => {
  it("should show the full chain from the top subject for a nested subject", () => {
    expect(describeSubjectPath(subjects, "hl")).toBe("Systems › High-load");
    expect(describeSubjectPath(subjects, "cache")).toBe("Systems › High-load › Caching");
  });

  it("should show just the name for a top-level subject", () => {
    expect(describeSubjectPath(subjects, "sys")).toBe("Systems");
  });

  it("should stop at a missing parent instead of failing", () => {
    expect(describeSubjectPath(subjects, "orphan")).toBe("Orphan");
  });

  it("should not loop forever when subjects point at each other", () => {
    expect(describeSubjectPath(subjects, "a")).toBe("B › A");
  });

  it("should return null for a subject that is not in the list, never inventing a name", () => {
    expect(describeSubjectPath(subjects, "nope")).toBeNull();
  });
});
