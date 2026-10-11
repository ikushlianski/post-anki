import { describe, expect, it } from "vitest";
import { buildModelStats } from "./knowledge-bit-feedback-stats.js";

describe("buildModelStats", () => {
  it("should compare approved and rejected suggestions per model", () => {
    const stats = buildModelStats([
      { modelId: "m/a", verdict: "approved", reasonCode: null, count: 6 },
      { modelId: "m/a", verdict: "rejected", reasonCode: "wrong_language", count: 2 },
      { modelId: "m/b", verdict: "approved", reasonCode: null, count: 1 },
      { modelId: "m/b", verdict: "rejected", reasonCode: "meta_wording", count: 4 },
    ]);

    expect(stats.models.find((m) => m.modelId === "m/a")).toMatchObject({ approved: 6, rejected: 2 });
    expect(stats.models.find((m) => m.modelId === "m/b")).toMatchObject({ approved: 1, rejected: 4 });
  });

  it("should list the three most frequent reject reasons, most frequent first", () => {
    const stats = buildModelStats([
      { modelId: "m/a", verdict: "rejected", reasonCode: "wrong_language", count: 1 },
      { modelId: "m/a", verdict: "rejected", reasonCode: "meta_wording", count: 5 },
      { modelId: "m/a", verdict: "rejected", reasonCode: "bad_format", count: 3 },
      { modelId: "m/a", verdict: "rejected", reasonCode: "other", count: 2 },
    ]);

    expect(stats.models[0]!.topReasons.map((r) => r.reasonCode)).toEqual(["meta_wording", "bad_format", "other"]);
  });

  it("should count a rejection without a reason as unspecified and keep unknown models apart", () => {
    const stats = buildModelStats([
      { modelId: null, verdict: "rejected", reasonCode: null, count: 2 },
      { modelId: null, verdict: "rejected", reasonCode: "unspecified", count: 1 },
    ]);

    expect(stats.models[0]).toMatchObject({ modelId: "unknown", rejected: 3 });
    expect(stats.models[0]!.topReasons).toEqual([{ reasonCode: "unspecified", count: 3 }]);
  });

  it("should put the model with the most reviews first", () => {
    const stats = buildModelStats([
      { modelId: "small", verdict: "approved", reasonCode: null, count: 1 },
      { modelId: "big", verdict: "approved", reasonCode: null, count: 9 },
    ]);

    expect(stats.models.map((m) => m.modelId)).toEqual(["big", "small"]);
  });
});
