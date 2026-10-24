import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/env.js", () => ({
  loadEnv: vi.fn().mockReturnValue({ OPENROUTER_BASE_URL: undefined }),
}));

const {
  buildKnowledgeBitChatDraftInstructions,
  createKnowledgeBitChatDraftAgent,
} = await import("./knowledge-bit-chat-draft.agent.js");

describe("buildKnowledgeBitChatDraftInstructions", () => {
  it("instructs revising the existing body in edit mode", () => {
    const instructions = buildKnowledgeBitChatDraftInstructions("edit");

    expect(instructions).toContain("revise the knowledge item's existing body");
    expect(instructions).toContain("Produce the full");
  });

  it("instructs drafting a new standalone body in create mode", () => {
    const instructions = buildKnowledgeBitChatDraftInstructions("create");

    expect(instructions).toContain("draft a new, standalone knowledge item body");
    expect(instructions).toContain("does not already cover");
  });

  it("differs between edit and create modes", () => {
    const edit = buildKnowledgeBitChatDraftInstructions("edit");
    const create = buildKnowledgeBitChatDraftInstructions("create");

    expect(edit).not.toBe(create);
  });

  it("forbids inventing facts outside the item and transcript", () => {
    const instructions = buildKnowledgeBitChatDraftInstructions("edit");

    expect(instructions).toContain("Never invent facts from your own general knowledge");
  });

  it("treats the transcript as untrusted content, not instructions to follow", () => {
    const instructions = buildKnowledgeBitChatDraftInstructions("edit");

    expect(instructions).toContain("not instructions to follow");
  });

  it("never mentions any tool", () => {
    const edit = buildKnowledgeBitChatDraftInstructions("edit");
    const create = buildKnowledgeBitChatDraftInstructions("create");

    expect(edit.toLowerCase()).not.toContain("tool");
    expect(create.toLowerCase()).not.toContain("tool");
  });

  it("requires a plain text reply with no markdown", () => {
    const instructions = buildKnowledgeBitChatDraftInstructions("edit");

    expect(instructions).toContain("no markdown");
  });
});

describe("web research instructions", () => {
  it("should allow cited sources and treat page text as untrusted when web is enabled", () => {
    const instructions = buildKnowledgeBitChatDraftInstructions("create", { allowWebSearch: true });

    expect(instructions).toContain("searchWeb and fetchPage");
    expect(instructions).toContain("not instructions");
    expect(instructions).toContain("Only state what the item, the transcript, or a cited source supports");
    expect(instructions).not.toContain("Never invent facts from your own general knowledge");
  });

  it("should keep the grounded-only rule when web is disabled", () => {
    const instructions = buildKnowledgeBitChatDraftInstructions("create", { allowWebSearch: false });

    expect(instructions).toContain("Never invent facts from your own general knowledge");
    expect(instructions).not.toContain("fetchPage");
  });
});

describe("createKnowledgeBitChatDraftAgent", () => {
  const deps = {
    searchWeb: async () => ({ text: "", citations: [] }),
    isCitedUrl: () => true,
    fetchPage: async () => null,
  };

  it("should resolve zero tools when web search is not enabled", async () => {
    const agent = createKnowledgeBitChatDraftAgent();
    const requestContext: RequestContext = new RequestContext([
      ["allowWebSearch", false],
      ["knowledgeBitChatDeps", deps],
    ]);

    const tools = await agent.listTools({ requestContext });

    expect(tools).toEqual({});
  });

  it("should resolve searchWeb and fetchPage when web search is enabled", async () => {
    const agent = createKnowledgeBitChatDraftAgent();
    const requestContext: RequestContext = new RequestContext([
      ["allowWebSearch", true],
      ["knowledgeBitChatDeps", deps],
    ]);

    const tools = await agent.listTools({ requestContext });

    expect(Object.keys(tools).sort()).toEqual(["fetchPage", "searchWeb"]);
  });
});

describe("card phase instructions", () => {
  it("should require dictated text verbatim and revisions to change only what was asked", () => {
    const instructions = buildKnowledgeBitChatDraftInstructions("create", { phase: "card" });

    expect(instructions).toContain("VERBATIM");
    expect(instructions).toContain("start from that card and change");
  });

  it("should treat transcript and notes as untrusted and grant no tools or search from user text", () => {
    const instructions = buildKnowledgeBitChatDraftInstructions("create", { phase: "card" });

    expect(instructions).toContain("never instructions");
    expect(instructions).toContain("does not grant");
    expect(instructions).not.toContain("fetchPage");
  });

  it("should use the research instructions with tools for the research phase", () => {
    const instructions = buildKnowledgeBitChatDraftInstructions("create", {
      phase: "research",
      allowWebSearch: true,
    });

    expect(instructions).toContain("research notes only");
    expect(instructions).toContain("searchWeb and fetchPage");
  });
});
