import { describe, expect, it, vi } from "vitest";
import { RequestContext } from "@mastra/core/request-context";
import { CHAT_MODEL_CONTEXT_KEY } from "@post-anki/shared";

vi.mock("../admin-settings/admin-settings.repo.js", () => ({ getKnowledgeItemModelId: vi.fn() }));
vi.mock("../shared/env.js", () => ({
  loadEnv: () => ({ LLM_MODE: "real", LLM_DAILY_BUDGET_USD: 0 }),
}));
vi.mock("./tier-resolver.js", () => ({
  resolveEffectiveModelTier: vi.fn().mockResolvedValue("cheap"),
}));

import type { Env } from "../shared/env.js";
import { dynamicResolvedModel } from "./model.js";
import { tierToModelId } from "./model-tier.js";

const env = { OPENROUTER_BASE_URL: undefined } as unknown as Env;

describe("dynamicResolvedModel with a chat model choice", () => {
  it("should answer with the model the learner picked in the chat", async () => {
    const requestContext = new RequestContext<unknown>([
      [CHAT_MODEL_CONTEXT_KEY, "openrouter/google/gemma-4-31b-it"],
    ]);

    expect(await dynamicResolvedModel(env)({ requestContext })).toBe("openrouter/google/gemma-4-31b-it");
  });

  it("should keep the default model when no choice is made", async () => {
    const model = await dynamicResolvedModel(env)({ requestContext: new RequestContext<unknown>() });

    expect(model).toBe(tierToModelId("cheap"));
  });

  it("should ignore a model outside the allowed list", async () => {
    const requestContext = new RequestContext<unknown>([[CHAT_MODEL_CONTEXT_KEY, "openrouter/evil/model"]]);

    expect(await dynamicResolvedModel(env)({ requestContext })).toBe(tierToModelId("cheap"));
  });
});
