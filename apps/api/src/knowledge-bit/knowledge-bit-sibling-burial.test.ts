import { describe, expect, it } from "vitest";
import {
  deriveSiblingBurial,
  deriveSiblingRelease,
  type SiblingBurialRow,
} from "./knowledge-bit-sibling-burial.js";

const buryUntil = new Date("2026-10-29T00:00:00.000Z");

const row = (overrides: Partial<SiblingBurialRow> = {}): SiblingBurialRow => ({
  reviewCount: 2,
  dueAt: new Date("2026-10-28T10:00:00.000Z"),
  suspendedAt: null,
  buriedUntil: null,
  ...overrides,
});

describe("deriveSiblingBurial", () => {
  it("should bury never-seen and due siblings until the next local day but not the graded card", () => {
    const buried = deriveSiblingBurial({
      gradedKey: "cloze:1",
      activeKeys: ["cloze:1", "cloze:2", "cloze:3"],
      rows: new Map([["cloze:3", row()]]),
      buryUntil,
    });

    expect(buried).toEqual([
      { cardKey: "cloze:2", prevBuriedUntil: null, buriedUntil: buryUntil.toISOString(), createdRow: true },
      { cardKey: "cloze:3", prevBuriedUntil: null, buriedUntil: buryUntil.toISOString(), createdRow: false },
    ]);
  });

  it("should leave suspended siblings, siblings due later, and already-buried siblings alone", () => {
    const buried = deriveSiblingBurial({
      gradedKey: "cloze:1",
      activeKeys: ["cloze:1", "cloze:2", "cloze:3", "cloze:4"],
      rows: new Map([
        ["cloze:2", row({ suspendedAt: new Date("2026-10-01T00:00:00.000Z") })],
        ["cloze:3", row({ dueAt: new Date("2026-11-02T00:00:00.000Z") })],
        ["cloze:4", row({ buriedUntil: new Date("2026-10-29T00:00:00.000Z") })],
      ]),
      buryUntil,
    });

    expect(buried).toEqual([]);
  });

  it("should remember an expired burial so undo can put it back", () => {
    const buried = deriveSiblingBurial({
      gradedKey: "list_step:1",
      activeKeys: ["list_step:1", "list_step:2"],
      rows: new Map([["list_step:2", row({ buriedUntil: new Date("2026-10-27T00:00:00.000Z") })]]),
      buryUntil,
    });

    expect(buried[0]?.prevBuriedUntil).toBe("2026-10-27T00:00:00.000Z");
  });
});

describe("deriveSiblingRelease", () => {
  const sibling = {
    cardKey: "cloze:2",
    prevBuriedUntil: null,
    buriedUntil: buryUntil.toISOString(),
    createdRow: true,
  };

  it("should delete a burial-only row the grade created", () => {
    const outcome = deriveSiblingRelease({
      sibling,
      row: row({ reviewCount: 0, buriedUntil: buryUntil }),
      reviewedSinceGrade: false,
    });

    expect(outcome).toEqual({ action: "delete" });
  });

  it("should restore the earlier burial on a row that existed before the grade", () => {
    const outcome = deriveSiblingRelease({
      sibling: { ...sibling, createdRow: false, prevBuriedUntil: "2026-10-27T00:00:00.000Z" },
      row: row({ buriedUntil: buryUntil }),
      reviewedSinceGrade: false,
    });

    expect(outcome).toEqual({ action: "restore", buriedUntil: new Date("2026-10-27T00:00:00.000Z") });
  });

  it("should keep a sibling the user unburied or graded since", () => {
    expect(
      deriveSiblingRelease({ sibling, row: row({ buriedUntil: null }), reviewedSinceGrade: false }),
    ).toEqual({ action: "leave" });
    expect(
      deriveSiblingRelease({ sibling, row: row({ buriedUntil: buryUntil }), reviewedSinceGrade: true }),
    ).toEqual({ action: "leave" });
  });
});
