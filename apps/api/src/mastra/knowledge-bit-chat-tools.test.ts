import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchWebFor, type KnowledgeBitChatToolsDeps } from "./knowledge-bit-chat-tools.js";

function makeDeps(overrides: Partial<KnowledgeBitChatToolsDeps> = {}): KnowledgeBitChatToolsDeps {
  return {
    searchWeb: vi.fn().mockResolvedValue({ text: "", citations: [] }),
    ...overrides,
  };
}

describe("searchWebFor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cites a real, safe url and filters out an unsafe one", async () => {
    const deps = makeDeps({
      searchWeb: vi.fn().mockResolvedValue({
        text: "current guidance",
        citations: ["https://example.com/real-source", "javascript:alert(1)"],
      }),
    });

    const result = await searchWebFor({ query: "current TCP RFC" }, deps);

    expect(result).toEqual({
      ok: true,
      text: "current guidance",
      citations: ["https://example.com/real-source"],
    });
  });

  it("passes the caller's query straight through to the search dependency", async () => {
    const deps = makeDeps();

    await searchWebFor({ query: "recent RFC updates" }, deps);

    expect(deps.searchWeb).toHaveBeenCalledWith("recent RFC updates");
  });
});
