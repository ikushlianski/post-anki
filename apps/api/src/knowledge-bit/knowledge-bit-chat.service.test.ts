import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const generateWithRetry = vi.fn(
  (_op: unknown, _curriculumId: unknown, _agentKey: unknown, fn: () => unknown) => fn(),
);

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { knowledgeBitChat: "knowledgeBitChat" },
  getMastra: () => ({ getAgent: () => ({ generate }) }),
}));

vi.mock("../mastra/generate-with-retry.js", () => ({
  generateWithRetry: (...args: Parameters<typeof generateWithRetry>) => generateWithRetry(...args),
}));

const getKnowledgeBitById = vi.fn();

vi.mock("./knowledge-bit.repo.js", () => ({
  getKnowledgeBitById: (id: string) => getKnowledgeBitById(id),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const webSearch = vi.fn();

vi.mock("../probe/probe-grounding.js", () => ({
  webSearch: (...args: unknown[]) => webSearch(...args),
}));

const { askKnowledgeBitChat } = await import("./knowledge-bit-chat.service.js");

describe("askKnowledgeBitChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getKnowledgeBitById.mockResolvedValue({
      id: "kb_1",
      body: "TCP uses a three-way handshake to establish a connection.",
      approvalState: "approved",
    });
    generate.mockResolvedValue({ text: "It uses SYN, SYN-ACK, ACK." });
    webSearch.mockResolvedValue({
      ok: true,
      text: "web text",
      citations: ["https://example.com/web"],
    });
  });

  it("grounds the reply on the knowledge item's own body", async () => {
    const result = await askKnowledgeBitChat("kb_1", { message: "How does TCP connect?" });

    const prompt = generate.mock.calls[0]![0] as string;

    expect(prompt).toContain("Knowledge item: TCP uses a three-way handshake to establish a connection.");
    expect(prompt).toContain("Learner: How does TCP connect?");
    expect(result).toEqual({ reply: "It uses SYN, SYN-ACK, ACK." });
  });

  it("calls generateWithRetry with the knowledge-bit-chat op and agent key", async () => {
    await askKnowledgeBitChat("kb_1", { message: "How does TCP connect?" });

    expect(generateWithRetry).toHaveBeenCalledWith(
      "knowledge_bit_chat_reply",
      null,
      "knowledgeBitChat",
      expect.any(Function),
    );
  });

  it("includes a passed-in transcript in the prompt, ahead of the new question", async () => {
    await askKnowledgeBitChat("kb_1", {
      message: "And after that?",
      transcript: [
        { role: "user", text: "What starts the handshake?" },
        { role: "assistant", text: "The client sends a SYN." },
      ],
    });

    const prompt = generate.mock.calls[0]![0] as string;
    const conversationIndex = prompt.indexOf("Conversation so far:");
    const learnerIndex = prompt.indexOf("Learner: And after that?");

    expect(prompt).toContain("What starts the handshake?");
    expect(prompt).toContain("The client sends a SYN.");
    expect(conversationIndex).toBeGreaterThanOrEqual(0);
    expect(conversationIndex).toBeLessThan(learnerIndex);
  });

  it("returns not_found and never call the model when the bit does not exist", async () => {
    getKnowledgeBitById.mockResolvedValue(null);

    const result = await askKnowledgeBitChat("missing", { message: "hi" });

    expect(result).toEqual({ error: "not_found" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("should return not_approved and never call the model when the bit is still pending", async () => {
    getKnowledgeBitById.mockResolvedValue({
      id: "kb_1",
      body: "TCP uses a three-way handshake to establish a connection.",
      approvalState: "pending",
    });

    const result = await askKnowledgeBitChat("kb_1", { message: "hi" });

    expect(result).toEqual({ error: "not_approved" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("should return not_approved and never call the model when the bit was rejected", async () => {
    getKnowledgeBitById.mockResolvedValue({
      id: "kb_1",
      body: "TCP uses a three-way handshake to establish a connection.",
      approvalState: "rejected",
    });

    const result = await askKnowledgeBitChat("kb_1", { message: "hi" });

    expect(result).toEqual({ error: "not_approved" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("falls back to a stock reply when the agent call fails", async () => {
    generate.mockRejectedValue(new Error("agent boom"));

    const result = await askKnowledgeBitChat("kb_1", { message: "hi" });

    expect(result).toEqual({ reply: "I couldn't reach the tutor right now — try again." });
  });

  it("wires a knowledgeBitChatDeps context entry and maxSteps when allowWebSearch is true", async () => {
    generate.mockImplementation(async (_prompt, opts) => {
      const deps = opts.requestContext.get("knowledgeBitChatDeps");

      await deps.searchWeb("recent TCP RFC updates");

      return { text: "Current guidance says…" };
    });

    await askKnowledgeBitChat("kb_1", {
      message: "What changed recently?",
      allowWebSearch: true,
    });

    expect(webSearch).toHaveBeenCalledTimes(1);
    expect(webSearch.mock.calls[0]?.[2]).toEqual({
      query: "recent TCP RFC updates",
      knowledgeBitId: "kb_1",
    });
    expect(generate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxSteps: 4 }),
    );
  });

  it("does not wire a knowledgeBitChatDeps context entry or maxSteps when allowWebSearch is false", async () => {
    await askKnowledgeBitChat("kb_1", { message: "How does TCP connect?" });

    const requestContext = generate.mock.calls[0]![1].requestContext;

    expect(requestContext.get("knowledgeBitChatDeps")).toBeUndefined();
    expect(generate.mock.calls[0]![1]).not.toHaveProperty("maxSteps");
  });

  it("forwards allowGeneralKnowledge into the request context when set", async () => {
    await askKnowledgeBitChat("kb_1", {
      message: "How does TCP connect?",
      allowGeneralKnowledge: true,
    });

    const requestContext = generate.mock.calls[0]![1].requestContext;

    expect(requestContext.get("allowGeneralKnowledge")).toBe(true);
  });

  it("returns empty text and citations when the web search call fails", async () => {
    webSearch.mockResolvedValue({ ok: false, status: 500 });
    generate.mockImplementation(async (_prompt, opts) => {
      const deps = opts.requestContext.get("knowledgeBitChatDeps");
      const outcome = await deps.searchWeb("recent TCP RFC updates");

      expect(outcome).toEqual({ text: "", citations: [] });

      return { text: "Fell back to the item's own content." };
    });

    const result = await askKnowledgeBitChat("kb_1", {
      message: "What changed recently?",
      allowWebSearch: true,
    });

    expect(result).toEqual({ reply: "Fell back to the item's own content." });
  });
});
