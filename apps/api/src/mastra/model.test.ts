import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestContext } from "@mastra/core/request-context";
import { DEFAULT_KNOWLEDGE_ITEM_MODEL_ID } from "@post-anki/shared";

const { getKnowledgeItemModelIdMock } = vi.hoisted(() => ({
  getKnowledgeItemModelIdMock: vi.fn(),
}));

vi.mock("../admin-settings/admin-settings.repo.js", () => ({
  getKnowledgeItemModelId: getKnowledgeItemModelIdMock,
}));

vi.mock("./tier-resolver.js", () => ({
  resolveEffectiveModelTier: vi.fn(),
}));

import type { Env } from "../shared/env.js";
import { dynamicKnowledgeItemModel } from "./model.js";

const env = { OPENROUTER_BASE_URL: undefined } as unknown as Env;

describe("dynamicKnowledgeItemModel", () => {
  beforeEach(() => {
    getKnowledgeItemModelIdMock.mockReset();
    getKnowledgeItemModelIdMock.mockResolvedValue(DEFAULT_KNOWLEDGE_ITEM_MODEL_ID);
  });

  it("should use the model pinned on the run's requestContext", async () => {
    const resolveModel = dynamicKnowledgeItemModel(env);
    const requestContext = new RequestContext<unknown>([
      ["knowledgeItemModelId", "openrouter/openai/gpt-4.1-nano"],
    ]);

    const model = await resolveModel({ requestContext });

    expect(model).toBe("openrouter/openai/gpt-4.1-nano");
    expect(getKnowledgeItemModelIdMock).not.toHaveBeenCalled();
  });

  it("should read the stored setting when no model is pinned", async () => {
    getKnowledgeItemModelIdMock.mockResolvedValueOnce("openrouter/mistralai/mistral-small-24b-instruct-2501");

    const resolveModel = dynamicKnowledgeItemModel(env);

    const model = await resolveModel({ requestContext: new RequestContext<unknown>() });

    expect(model).toBe("openrouter/mistralai/mistral-small-24b-instruct-2501");
    expect(getKnowledgeItemModelIdMock).toHaveBeenCalledTimes(1);
  });

  it("should read the stored setting when called without a requestContext", async () => {
    getKnowledgeItemModelIdMock.mockResolvedValueOnce("openrouter/openai/gpt-4o-mini");

    const resolveModel = dynamicKnowledgeItemModel(env);

    expect(await resolveModel({})).toBe("openrouter/openai/gpt-4o-mini");
  });

  it("should route through the configured OpenRouter base URL when one is set", async () => {
    const resolveModel = dynamicKnowledgeItemModel({
      OPENROUTER_BASE_URL: "https://proxy.example.test/v1",
    } as unknown as Env);

    const model = await resolveModel({
      requestContext: new RequestContext<unknown>([
        ["knowledgeItemModelId", "openrouter/openai/gpt-4.1-nano"],
      ]),
    });

    expect(model).toEqual({
      id: "openrouter/openai/gpt-4.1-nano",
      url: "https://proxy.example.test/v1",
    });
  });
});
