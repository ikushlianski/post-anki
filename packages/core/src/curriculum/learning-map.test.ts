import { describe, it, expect } from "vitest";
import { summarizeLearningMap, MAX_CURRICULA, MAX_CHARS } from "./learning-map";
import type { LearningMapSnapshot } from "@post-anki/shared";

function snapshot(overrides: Partial<LearningMapSnapshot>): LearningMapSnapshot {
  return {
    curriculumId: "cur-1",
    curriculumName: "Next.js",
    subjectName: "Frontend",
    learningStatus: "not_started",
    percent: 0,
    lastInteractedAt: null,
    modules: [],
    ...overrides,
  };
}

describe("summarizeLearningMap", () => {
  it("says nothing else studied yet when there are no other curricula", () => {
    expect(summarizeLearningMap([])).toBe("Nothing else studied yet.");
  });

  it("produces one compact line per curriculum with percent mastered", () => {
    const result = summarizeLearningMap([
      snapshot({ curriculumId: "cur-1", curriculumName: "Next.js", percent: 82 }),
    ]);

    expect(result).toBe("Next.js — 82% mastered");
  });

  it("includes the highest level reached when the curriculum has level-tiered modules", () => {
    const result = summarizeLearningMap([
      snapshot({
        curriculumId: "cur-1",
        curriculumName: "Vue.js",
        percent: 40,
        modules: [
          { level: "basic", progress: { topicsIncluded: 2, topicsMastered: 2, percent: 100 }, topics: [] },
          { level: "medium", progress: { topicsIncluded: 3, topicsMastered: 1, percent: 33 }, topics: [] },
        ],
      }),
    ]);

    expect(result).toBe("Vue.js — 40% mastered, medium level");
  });

  it("omits the level fragment when no module has a level or none has any progress", () => {
    const result = summarizeLearningMap([
      snapshot({
        curriculumId: "cur-1",
        curriculumName: "Pasted material",
        percent: 20,
        modules: [
          { level: null, progress: { topicsIncluded: 2, topicsMastered: 0, percent: 20 }, topics: [] },
        ],
      }),
    ]);

    expect(result).toBe("Pasted material — 20% mastered");
  });

  it("ranks in-progress curricula ahead of not-started and done ones", () => {
    const result = summarizeLearningMap([
      snapshot({ curriculumId: "cur-done", curriculumName: "Done Course", learningStatus: "done", percent: 100 }),
      snapshot({ curriculumId: "cur-active", curriculumName: "Active Course", learningStatus: "probing", percent: 40 }),
      snapshot({ curriculumId: "cur-new", curriculumName: "Not Started Course", learningStatus: "not_started", percent: 0 }),
    ]);

    expect(result.split("\n")).toEqual([
      "Active Course — 40% mastered",
      "Done Course — 100% mastered",
      "Not Started Course — 0% mastered",
    ]);
  });

  it("within the same in-progress tier, ranks the most recently interacted curriculum first", () => {
    const result = summarizeLearningMap([
      snapshot({
        curriculumId: "cur-old",
        curriculumName: "Old",
        learningStatus: "probing",
        percent: 40,
        lastInteractedAt: "2026-01-01T00:00:00.000Z",
      }),
      snapshot({
        curriculumId: "cur-recent",
        curriculumName: "Recent",
        learningStatus: "probing",
        percent: 40,
        lastInteractedAt: "2026-07-01T00:00:00.000Z",
      }),
    ]);

    expect(result.split("\n")).toEqual(["Recent — 40% mastered", "Old — 40% mastered"]);
  });

  it("falls back to highest mastery when in-progress and recency both tie", () => {
    const result = summarizeLearningMap([
      snapshot({ curriculumId: "cur-a", curriculumName: "Lower", learningStatus: "not_started", percent: 10 }),
      snapshot({ curriculumId: "cur-b", curriculumName: "Higher", learningStatus: "not_started", percent: 90 }),
    ]);

    expect(result.split("\n")).toEqual(["Higher — 90% mastered", "Lower — 10% mastered"]);
  });

  it("caps the number of curricula included at MAX_CURRICULA", () => {
    const snapshots = Array.from({ length: MAX_CURRICULA + 5 }, (_, i) =>
      snapshot({
        curriculumId: `cur-${i}`,
        curriculumName: `Course ${i}`,
        learningStatus: "probing",
        percent: 50,
        lastInteractedAt: new Date(2026, 0, i + 1).toISOString(),
      }),
    );

    const result = summarizeLearningMap(snapshots);

    expect(result.split("\n")).toHaveLength(MAX_CURRICULA);
  });

  it("stays within the fixed character budget even with many curricula", () => {
    const snapshots = Array.from({ length: 50 }, (_, i) =>
      snapshot({
        curriculumId: `cur-${i}`,
        curriculumName: `A very long curriculum name for course number ${i}`,
        learningStatus: "probing",
        percent: 50,
        lastInteractedAt: new Date(2026, 0, i + 1).toISOString(),
      }),
    );

    const result = summarizeLearningMap(snapshots);

    expect(result.length).toBeLessThanOrEqual(MAX_CHARS);
  });

  it("drops lowest-ranked entries rather than truncating mid-sentence when over budget", () => {
    const snapshots = Array.from({ length: 50 }, (_, i) =>
      snapshot({
        curriculumId: `cur-${i}`,
        curriculumName: `A very long curriculum name for course number ${i}`,
        learningStatus: "probing",
        percent: 50,
        lastInteractedAt: new Date(2026, 0, i + 1).toISOString(),
      }),
    );

    const result = summarizeLearningMap(snapshots);
    const lines = result.split("\n");

    for (const line of lines) {
      expect(line.endsWith("mastered") || /level$/.test(line)).toBe(true);
    }
  });
});
