import { describe, expect, it } from "vitest";
import {
  assignSequenceNumbersByCreatedAt,
  buildImportId,
  deriveActivePhraseBankStatus,
  renumberActiveEntrySchedule,
} from "./migrate-english-practice-data.derive.js";

describe("deriveActivePhraseBankStatus", () => {
  it("classifies a phrase in isolation mode as struggling even when masteryStage is 0", () => {
    expect(deriveActivePhraseBankStatus({ masteryStage: 0, mode: "isolation" })).toBe("struggling");
  });

  it("classifies a phrase in isolation mode as struggling even when masteryStage is above 0", () => {
    expect(deriveActivePhraseBankStatus({ masteryStage: 2, mode: "isolation" })).toBe("struggling");
  });

  it("classifies a never-attempted phrase (masteryStage 0, mixed mode) as new", () => {
    expect(deriveActivePhraseBankStatus({ masteryStage: 0, mode: "mixed" })).toBe("new");
  });

  it("classifies a phrase with mastery progress and mixed mode as practicing", () => {
    expect(deriveActivePhraseBankStatus({ masteryStage: 1, mode: "mixed" })).toBe("practicing");
    expect(deriveActivePhraseBankStatus({ masteryStage: 2, mode: "mixed" })).toBe("practicing");
  });
});

describe("renumberActiveEntrySchedule", () => {
  it("sets scheduledForSentenceCount to the scope's post-import max sequence number exactly", () => {
    const result = renumberActiveEntrySchedule(42);

    expect(result.scheduledForSentenceCount).toBe(42);
  });

  it("always sets lastCorrectAtSentenceCount to null, never the renumbered value", () => {
    const result = renumberActiveEntrySchedule(42);

    expect(result.lastCorrectAtSentenceCount).toBeNull();
  });
});

describe("assignSequenceNumbersByCreatedAt", () => {
  it("assigns ascending sequence numbers in createdAt order, starting at startingBase + 1", () => {
    const phrases = [
      { id: "c", createdAt: "2026-01-03T00:00:00Z" },
      { id: "a", createdAt: "2026-01-01T00:00:00Z" },
      { id: "b", createdAt: "2026-01-02T00:00:00Z" },
    ];

    const result = assignSequenceNumbersByCreatedAt(phrases, 10);

    expect(result.map((p) => [p.id, p.sequenceNumber])).toEqual([
      ["a", 11],
      ["b", 12],
      ["c", 13],
    ]);
  });

  it("continues from a nonzero startingBase rather than assuming the level starts at zero", () => {
    const phrases = [{ id: "only", createdAt: "2026-01-01T00:00:00Z" }];

    const result = assignSequenceNumbersByCreatedAt(phrases, 100);

    expect(result[0]!.sequenceNumber).toBe(101);
  });

  it("returns an empty array when there are no phrases to assign", () => {
    expect(assignSequenceNumbersByCreatedAt([], 5)).toEqual([]);
  });
});

describe("buildImportId", () => {
  it("builds a deterministic id from a prefix and a stable source key", () => {
    expect(buildImportId("phrase", "abc-123")).toBe("phrase_import_abc-123");
  });

  it("produces the same id for the same inputs across calls", () => {
    expect(buildImportId("pbe", "bite-off-more")).toBe(buildImportId("pbe", "bite-off-more"));
  });
});
