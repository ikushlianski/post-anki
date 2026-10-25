import { describe, expect, it } from "vitest";
import { pickSubSubjectPoolIds } from "./subject-suggestion-pool.js";

const parent = { id: "p", name: "Business" };

describe("pickSubSubjectPoolIds", () => {
  it("should use only the subject's own cards when it has no sub-subjects", () => {
    expect(pickSubSubjectPoolIds(parent, [])).toEqual(["p"]);
  });

  it("should use the parent's own cards when its sub-subjects are ordinary", () => {
    expect(pickSubSubjectPoolIds(parent, [{ id: "s", name: "Sales" }])).toEqual(["p"]);
  });

  it("should add a legacy Common sub-subject's cards to the parent's own cards", () => {
    expect(
      pickSubSubjectPoolIds(parent, [
        { id: "s", name: "Sales" },
        { id: "c", name: "Common" },
      ]),
    ).toEqual(["p", "c"]);
  });
});
