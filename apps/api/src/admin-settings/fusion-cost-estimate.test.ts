import { describe, expect, it } from "vitest";
import { KNOWLEDGE_ITEM_MODELS } from "@post-anki/shared";
process.env.OPENROUTER_API_KEY ??= "test-key";

const { estimateFusionCostPerSource } = await import("./fusion-cost-estimate.js");

const CHEAP = "openrouter/openai/gpt-oss-120b";
const PRICIER = "openrouter/meta-llama/llama-3.3-70b-instruct";

describe("estimateFusionCostPerSource", () => {
  it("should be zero when no models are chosen", () => {
    expect(estimateFusionCostPerSource([])).toEqual({ perModel: [], totalEstimatedCostUsd: 0 });
  });

  it("should total the per-model costs for the chosen models", () => {
    const estimate = estimateFusionCostPerSource([CHEAP, PRICIER]);

    expect(estimate.perModel.map((entry) => entry.modelId)).toEqual([CHEAP, PRICIER]);
    expect(estimate.totalEstimatedCostUsd).toBeCloseTo(
      estimate.perModel[0]!.estimatedCostUsd + estimate.perModel[1]!.estimatedCostUsd,
    );
  });

  it("should price a model with higher token rates above a cheaper one", () => {
    const estimate = estimateFusionCostPerSource([CHEAP, PRICIER]);

    expect(KNOWLEDGE_ITEM_MODELS[PRICIER].inputPerMillion).toBeGreaterThan(KNOWLEDGE_ITEM_MODELS[CHEAP].inputPerMillion);
    expect(estimate.perModel[1]!.estimatedCostUsd).toBeGreaterThan(estimate.perModel[0]!.estimatedCostUsd);
  });
});
