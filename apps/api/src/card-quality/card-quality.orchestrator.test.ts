import { describe, expect, it } from "vitest";
import { approvalRate, buildCardQuality } from "./card-quality.orchestrator.js";

const base = { approved: 0, rejected: 0, chat: 0, pending: 0, superseded: 0 };

describe("approvalRate", () => {
  it("should be approved over decided cards", () => {
    expect(approvalRate(3, 1)).toBe(0.75);
  });

  it("should be null when nothing was decided yet", () => {
    expect(approvalRate(0, 0)).toBeNull();
  });
});

describe("buildCardQuality", () => {
  it("should ignore pending, chat and superseded cards when computing the approval rate", () => {
    const { models } = buildCardQuality(
      [{ modelId: "m1", ...base, approved: 1, rejected: 1, pending: 50, chat: 9, superseded: 4 }],
      [],
      [],
    );

    expect(models[0]?.approvalRate).toBe(0.5);
  });

  it("should show no rate for a model with only undecided cards", () => {
    const { models } = buildCardQuality([{ modelId: "m1", ...base, pending: 5 }], [], []);

    expect(models[0]?.approvalRate).toBeNull();
    expect(models[0]?.averageRating).toBeNull();
  });

  it("should attach the average rating and only the three most common reject reasons", () => {
    const { models } = buildCardQuality(
      [{ modelId: "m1", ...base, rejected: 10 }],
      [{ modelId: "m1", averageRating: 3.5 }],
      [
        { modelId: "m1", reasonCode: "a", count: 1 },
        { modelId: "m1", reasonCode: "b", count: 5 },
        { modelId: "m1", reasonCode: "c", count: 3 },
        { modelId: "m1", reasonCode: "d", count: 2 },
        { modelId: "m2", reasonCode: "z", count: 99 },
      ],
    );

    expect(models[0]?.averageRating).toBe(3.5);
    expect(models[0]?.topReasons.map((r) => r.reasonCode)).toEqual(["b", "c", "d"]);
  });

  it("should list the busiest model first and keep the unknown bucket", () => {
    const { models } = buildCardQuality(
      [
        { modelId: "unknown", ...base, approved: 1 },
        { modelId: "m1", ...base, approved: 5, rejected: 2 },
      ],
      [],
      [],
    );

    expect(models.map((m) => m.modelId)).toEqual(["m1", "unknown"]);
  });
});
