import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../global-card-chat/global-card-chat.service.js", () => ({ askGlobalCardChat: vi.fn() }));

const { askGlobalCardChat } = await import("../global-card-chat/global-card-chat.service.js");
const { askMyCards } = await import("./ask-my-cards.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

describe("askMyCards", () => {
  it("should refuse a token without knowledge:write before spending any AI budget", async () => {
    const result = await askMyCards({ question: "Why?" }, { scopes: ["cards:write"] });

    expect(result).toEqual({ error: "missing_scope" });
    expect(askGlobalCardChat).not.toHaveBeenCalled();
  });

  it("should return the answer with the cards it drew on, using only the user's cards", async () => {
    vi.mocked(askGlobalCardChat).mockResolvedValue({
      reply: "Paris.",
      matchedCards: [{ variantId: "v1", prompt: "Capital of France?", topicTitle: "Geo" }],
      lookupFailed: false,
    });

    const result = await askMyCards({ question: "Capital of France?" }, { scopes: ["knowledge:write"] });

    expect(askGlobalCardChat).toHaveBeenCalledWith({ message: "Capital of France?", allowGeneralKnowledge: false });
    expect(result).toEqual({
      answer: "Paris.",
      citedCards: [{ variantId: "v1", front: "Capital of France?", topicTitle: "Geo" }],
      lookupFailed: false,
    });
  });
});
