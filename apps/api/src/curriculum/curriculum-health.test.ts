import { describe, expect, it } from "vitest";
import {
  evaluateStuckCurricula,
  type StructureTurnTimingRow,
  type StuckCurriculumCandidate,
} from "./curriculum-health.js";

const NOW = new Date("2026-07-18T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function candidate(overrides: Partial<StuckCurriculumCandidate> = {}): StuckCurriculumCandidate {
  return {
    id: "cur_1",
    name: "Event-Driven Systems",
    status: "curating",
    createdAt: minutesAgo(0),
    ...overrides,
  };
}

function turnRow(overrides: Partial<StructureTurnTimingRow> = {}): StructureTurnTimingRow {
  return {
    curriculumId: "cur_1",
    role: "assistant",
    status: "complete",
    createdAt: minutesAgo(0),
    ...overrides,
  };
}

describe("evaluateStuckCurricula", () => {
  it("does not flag a candidate whose reference timestamp is under the threshold", () => {
    const result = evaluateStuckCurricula(
      [candidate({ createdAt: minutesAgo(10) })],
      [],
      NOW,
    );

    expect(result).toEqual([]);
  });

  it("flags a curating curriculum with no structure turns once its own createdAt is old enough", () => {
    const result = evaluateStuckCurricula(
      [candidate({ status: "curating", createdAt: minutesAgo(45) })],
      [],
      NOW,
    );

    expect(result).toEqual([
      { id: "cur_1", name: "Event-Driven Systems", status: "curating", stuckForMs: 45 * 60 * 1000 },
    ]);
  });

  it("uses the latest structure turn's createdAt as the reference time instead of the curriculum's own createdAt", () => {
    const result = evaluateStuckCurricula(
      [candidate({ status: "shaping_structure", createdAt: minutesAgo(120) })],
      [
        turnRow({ createdAt: minutesAgo(100) }),
        turnRow({ createdAt: minutesAgo(40) }),
      ],
      NOW,
    );

    expect(result).toEqual([
      {
        id: "cur_1",
        name: "Event-Driven Systems",
        status: "shaping_structure",
        stuckForMs: 40 * 60 * 1000,
      },
    ]);
  });

  it("excludes a curriculum with a fresh pending assistant turn — that's normal in-flight work", () => {
    const result = evaluateStuckCurricula(
      [candidate({ status: "shaping_structure", createdAt: minutesAgo(60) })],
      [turnRow({ role: "assistant", status: "pending", createdAt: minutesAgo(2) })],
      NOW,
    );

    expect(result).toEqual([]);
  });

  it("still flags a curriculum whose pending assistant turn has gone stale", () => {
    const result = evaluateStuckCurricula(
      [candidate({ status: "shaping_structure", createdAt: minutesAgo(60) })],
      [turnRow({ role: "assistant", status: "pending", createdAt: minutesAgo(35) })],
      NOW,
    );

    expect(result).toEqual([
      {
        id: "cur_1",
        name: "Event-Driven Systems",
        status: "shaping_structure",
        stuckForMs: 35 * 60 * 1000,
      },
    ]);
  });

  it("does not exclude on a fresh pending turn belonging to a different curriculum", () => {
    const result = evaluateStuckCurricula(
      [
        candidate({ id: "cur_1", status: "shaping_structure", createdAt: minutesAgo(60) }),
        candidate({ id: "cur_2", status: "shaping_structure", createdAt: minutesAgo(60) }),
      ],
      [turnRow({ curriculumId: "cur_2", role: "assistant", status: "pending", createdAt: minutesAgo(1) })],
      NOW,
    );

    expect(result.map((r) => r.id)).toEqual(["cur_1"]);
  });

  it("sorts stuck curricula longest-stuck first", () => {
    const result = evaluateStuckCurricula(
      [
        candidate({ id: "cur_short", createdAt: minutesAgo(31) }),
        candidate({ id: "cur_long", createdAt: minutesAgo(200) }),
      ],
      [],
      NOW,
    );

    expect(result.map((r) => r.id)).toEqual(["cur_long", "cur_short"]);
  });

  it("ignores turn rows for curricula outside the candidate set", () => {
    const result = evaluateStuckCurricula(
      [candidate({ id: "cur_1", status: "curating", createdAt: minutesAgo(45) })],
      [turnRow({ curriculumId: "cur_unrelated", createdAt: minutesAgo(0) })],
      NOW,
    );

    expect(result).toEqual([
      { id: "cur_1", name: "Event-Driven Systems", status: "curating", stuckForMs: 45 * 60 * 1000 },
    ]);
  });
});
