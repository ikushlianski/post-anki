import { describe, expect, it } from "vitest";
import { KNOWLEDGE_ITEM_MODEL_IDS } from "./knowledge-item-model";
import { fusionSettingsSchema, FUSION_MAX_MODELS, FUSION_MIN_MODELS } from "./fusion-settings";

const ids = (count: number) => KNOWLEDGE_ITEM_MODEL_IDS.slice(0, count);

describe("fusionSettingsSchema", () => {
  it.each([FUSION_MIN_MODELS, 3, FUSION_MAX_MODELS])(
    "should accept %i distinct models when fusion is on",
    (count) => {
      expect(fusionSettingsSchema.safeParse({ fusionEnabled: true, fusionModelIds: ids(count) }).success).toBe(true);
    },
  );

  it.each([0, 1, FUSION_MAX_MODELS + 1])("should refuse %i models when fusion is on", (count) => {
    expect(fusionSettingsSchema.safeParse({ fusionEnabled: true, fusionModelIds: ids(count) }).success).toBe(false);
  });

  it("should refuse duplicate models even when fusion is off", () => {
    const [first] = ids(1);

    expect(fusionSettingsSchema.safeParse({ fusionEnabled: false, fusionModelIds: [first, first] }).success).toBe(
      false,
    );
  });

  it("should refuse duplicate models when fusion is on", () => {
    const [first, second] = ids(2);

    expect(
      fusionSettingsSchema.safeParse({ fusionEnabled: true, fusionModelIds: [first, second, first] }).success,
    ).toBe(false);
  });

  it("should refuse unknown model ids", () => {
    expect(
      fusionSettingsSchema.safeParse({ fusionEnabled: true, fusionModelIds: ["a/b", "c/d"] }).success,
    ).toBe(false);
  });

  it("should allow an empty or single-model list while fusion is off", () => {
    expect(fusionSettingsSchema.safeParse({ fusionEnabled: false, fusionModelIds: [] }).success).toBe(true);
    expect(fusionSettingsSchema.safeParse({ fusionEnabled: false, fusionModelIds: ids(1) }).success).toBe(true);
  });
});
