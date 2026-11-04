import { describe, expect, it } from "vitest";
import { deriveEditScheduleChange } from "./knowledge-bit-card-edit-schedule.js";

describe("deriveEditScheduleChange", () => {
  it("should drop the progress of a removed gap and keep the rest", () => {
    const change = deriveEditScheduleChange({
      before: ["cloze:1", "cloze:2", "cloze:3"],
      after: ["cloze:1", "cloze:2"],
      suspendedKeys: new Set(),
    });

    expect(change).toEqual({ removed: ["cloze:3"], addedSuspended: [] });
  });

  it("should start a new gap as an ordinary new card", () => {
    const change = deriveEditScheduleChange({
      before: ["cloze:1"],
      after: ["cloze:1", "cloze:2"],
      suspendedKeys: new Set(),
    });

    expect(change).toEqual({ removed: [], addedSuspended: [] });
  });

  it("should start a new gap suspended when every existing gap is suspended", () => {
    const change = deriveEditScheduleChange({
      before: ["cloze:1", "cloze:2"],
      after: ["cloze:1", "cloze:2", "cloze:3"],
      suspendedKeys: new Set(["cloze:1", "cloze:2"]),
    });

    expect(change.addedSuspended).toEqual(["cloze:3"]);
  });

  it("should not suspend a new gap when one existing gap is still active", () => {
    const change = deriveEditScheduleChange({
      before: ["cloze:1", "cloze:2"],
      after: ["cloze:1", "cloze:2", "cloze:3"],
      suspendedKeys: new Set(["cloze:1"]),
    });

    expect(change.addedSuspended).toEqual([]);
  });
});
