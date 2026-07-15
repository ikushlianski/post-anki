import { describe, it, expect } from "vitest";
import { priorLevelCoverageLabels } from "./level-context";

describe("priorLevelCoverageLabels", () => {
  it("returns an empty list when the current level is null", () => {
    const result = priorLevelCoverageLabels(null, [
      { level: "basic", coveredLabels: ["closures"] },
    ]);

    expect(result).toEqual([]);
  });

  it("returns an empty list when nothing is below the current level", () => {
    const result = priorLevelCoverageLabels("basic", [
      { level: "medium", coveredLabels: ["generics"] },
      { level: "advanced", coveredLabels: ["variance"] },
    ]);

    expect(result).toEqual([]);
  });

  it("collects covered labels from strictly lower-rank levels", () => {
    const result = priorLevelCoverageLabels("advanced", [
      { level: "basic", coveredLabels: ["closures", "hoisting"] },
      { level: "medium", coveredLabels: ["generics"] },
      { level: "advanced", coveredLabels: ["variance"] },
    ]);

    expect(result).toEqual(["closures", "hoisting", "generics"]);
  });

  it("ignores modules with a null level", () => {
    const result = priorLevelCoverageLabels("medium", [
      { level: null, coveredLabels: ["untiered concept"] },
      { level: "basic", coveredLabels: ["closures"] },
    ]);

    expect(result).toEqual(["closures"]);
  });

  it("dedupes labels that appear in more than one lower module", () => {
    const result = priorLevelCoverageLabels("medium", [
      { level: "basic", coveredLabels: ["closures"] },
      { level: "basic", coveredLabels: ["closures", "hoisting"] },
    ]);

    expect(result).toEqual(["closures", "hoisting"]);
  });

  it("returns an empty list when there are no other modules", () => {
    expect(priorLevelCoverageLabels("basic", [])).toEqual([]);
  });
});
