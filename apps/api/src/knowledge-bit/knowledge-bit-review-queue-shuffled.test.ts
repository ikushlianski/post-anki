import { describe, expect, it } from "vitest";

import { inIdOrder, pickShuffledVariantIds } from "./knowledge-bit-review-queue-shuffled.js";

const reference = new Date(Date.UTC(2026, 3, 1));
const rows = Array.from({ length: 30 }, (_, i) => ({
  variantId: `v${String(i).padStart(2, "0")}`,
  cardSubjectId: i % 2 === 0 ? "a" : "b",
  createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
}));

describe("pickShuffledVariantIds", () => {
  it("should respect each subject's remaining allowance after shuffling", () => {
    const ids = pickShuffledVariantIds(rows, "s", reference, 20, (subject) => (subject === "a" ? 2 : 5));
    const subjects = ids.map((id) => rows.find((row) => row.variantId === id)!.cardSubjectId);

    expect(subjects.filter((s) => s === "a")).toHaveLength(2);
    expect(subjects.filter((s) => s === "b")).toHaveLength(5);
  });

  it("should never return more cards than the limit", () => {
    expect(pickShuffledVariantIds(rows, "s", reference, 4, () => 99)).toHaveLength(4);
  });

  it("should list not-yet-due cards after due ones", () => {
    const flagged = rows.map((row, i) => ({ ...row, notYetDue: i < 25 ? 1 : 0 }));
    const ids = pickShuffledVariantIds(flagged, "s", reference, 5, () => 99);

    expect(ids.sort()).toEqual(["v25", "v26", "v27", "v28", "v29"]);
  });

  it("should give the same picks for the same seed", () => {
    expect(pickShuffledVariantIds(rows, "s", reference, 10, () => 99)).toEqual(
      pickShuffledVariantIds(rows, "s", reference, 10, () => 99),
    );
  });
});

describe("inIdOrder", () => {
  it("should return rows in the order of the given ids", () => {
    expect(inIdOrder([{ variantId: "a" }, { variantId: "b" }, { variantId: "c" }], ["c", "a", "b"])).toEqual([
      { variantId: "c" },
      { variantId: "a" },
      { variantId: "b" },
    ]);
  });
});
