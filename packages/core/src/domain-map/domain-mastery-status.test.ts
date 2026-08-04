import { describe, it, expect } from "vitest";
import { domainMasteryStatus } from "./domain-mastery-status";

// separate-progress-overlay-from-structure (issue #85), SCENARIO 2/3/6 — a
// pure classification of the existing `percent` rollup into the two states
// the domain map's badge needs to distinguish: nothing learned yet ("gap")
// vs. any real progress ("progress"). No I/O, no new data.
describe("domainMasteryStatus", () => {
  it("classifies zero percent as a gap", () => {
    expect(domainMasteryStatus(0)).toBe("gap");
  });

  it("classifies any percent from 1 through 100 as progress", () => {
    for (let percent = 1; percent <= 100; percent += 1) {
      expect(domainMasteryStatus(percent)).toBe("progress");
    }
  });
});
