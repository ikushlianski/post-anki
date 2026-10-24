import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const generateWithRetry = vi.fn(
  (_op: unknown, _curriculumId: unknown, _agentKey: unknown, fn: () => unknown) => fn(),
);

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { knowledgeBitChatDraft: "knowledgeBitChatDraft" },
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

vi.mock("../shared/outbound-fetch.js", () => ({
  fetchWithTimeout: vi.fn(),
  truncateText: (text: string, max: number) => text.slice(0, max),
}));

const { draftKnowledgeBitChat } = await import("./knowledge-bit-chat-draft.service.js");

describe("draftKnowledgeBitChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getKnowledgeBitById.mockResolvedValue({
      id: "kb_1",
      body: "TCP uses a three-way handshake to establish a connection.",
      approvalState: "approved",
    });
    generate.mockResolvedValue({
      object: {
        front: "What starts the handshake?",
        back: "The client sends a SYN.",
        example: "curl opens a TCP connection first.",
      },
    });
  });

  it("returns not_found and never call the model when the bit does not exist", async () => {
    getKnowledgeBitById.mockResolvedValue(null);

    const result = await draftKnowledgeBitChat("missing", {
      transcript: [{ role: "user", text: "What starts the handshake?" }],
      mode: "edit",
    });

    expect(result).toEqual({ error: "not_found" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("should return not_approved and never call the model when the bit is still pending", async () => {
    getKnowledgeBitById.mockResolvedValue({
      id: "kb_1",
      body: "TCP uses a three-way handshake to establish a connection.",
      approvalState: "pending",
    });

    const result = await draftKnowledgeBitChat("kb_1", {
      transcript: [{ role: "user", text: "What starts the handshake?" }],
      mode: "edit",
    });

    expect(result).toEqual({ error: "not_approved" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("should return not_approved and never call the model when the bit was rejected", async () => {
    getKnowledgeBitById.mockResolvedValue({
      id: "kb_1",
      body: "TCP uses a three-way handshake to establish a connection.",
      approvalState: "rejected",
    });

    const result = await draftKnowledgeBitChat("kb_1", {
      transcript: [{ role: "user", text: "What starts the handshake?" }],
      mode: "edit",
    });

    expect(result).toEqual({ error: "not_approved" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("builds a prompt containing the bit body, transcript, and mode", async () => {
    await draftKnowledgeBitChat("kb_1", {
      transcript: [
        { role: "user", text: "What starts the handshake?" },
        { role: "assistant", text: "The client sends a SYN." },
      ],
      mode: "edit",
    });

    const prompt = generate.mock.calls[0]![0] as string;

    expect(prompt).toContain("Knowledge item: TCP uses a three-way handshake to establish a connection.");
    expect(prompt).toContain("Mode: edit");
    expect(prompt).toContain("What starts the handshake?");
    expect(prompt).toContain("The client sends a SYN.");
  });

  it("calls generateWithRetry with the draft op and draft agent key", async () => {
    await draftKnowledgeBitChat("kb_1", {
      transcript: [{ role: "user", text: "hi" }],
      mode: "create",
    });

    expect(generateWithRetry).toHaveBeenCalledWith(
      "knowledge_bit_chat_draft",
      null,
      "knowledgeBitChatDraft",
      expect.any(Function),
    );
  });

  it("forwards the mode into the agent's request context", async () => {
    await draftKnowledgeBitChat("kb_1", {
      transcript: [{ role: "user", text: "hi" }],
      mode: "create",
    });

    const requestContext = generate.mock.calls[0]![1].requestContext;

    expect(requestContext.get("mode")).toBe("create");
  });

  it("returns the structured card with its sources", async () => {
    const result = await draftKnowledgeBitChat("kb_1", {
      transcript: [{ role: "user", text: "hi" }],
      mode: "edit",
    });

    expect(result).toEqual({
      sources: [],
      card: {
        front: "What starts the handshake?",
        back: "The client sends a SYN.",
        example: "curl opens a TCP connection first.",
        sources: [],
        usedWebSearch: false,
      },
    });
  });

  it("should omit the example when the model returns null", async () => {
    generate.mockResolvedValue({ object: { front: "Q", back: "A", example: null } });

    const result = await draftKnowledgeBitChat("kb_1", { transcript: [], mode: "create" });

    expect(result).toMatchObject({ card: { front: "Q", back: "A", usedWebSearch: false } });
    expect("card" in result && result.card.example).toBeUndefined();
  });

  it("should send the dictated question, answer and example verbatim in the prompt and keep them in the result", async () => {
    const instruction = "card: Q Why SYN? A Because it syncs sequence numbers. example curl";

    generate.mockResolvedValue({
      object: { front: "Why SYN?", back: "Because it syncs sequence numbers.", example: "curl" },
    });

    const result = await draftKnowledgeBitChat("kb_1", { transcript: [], mode: "create", instruction });

    expect(generate.mock.calls[0]![0]).toContain(`Learner instruction:\n${instruction}`);
    expect(result).toMatchObject({
      card: { front: "Why SYN?", back: "Because it syncs sequence numbers.", example: "curl" },
    });
  });

  it("should pass the previous card to the model when revising", async () => {
    await draftKnowledgeBitChat("kb_1", {
      transcript: [],
      mode: "create",
      instruction: "shorter answer",
      previous: { front: "Old Q", back: "Old A", sources: [], usedWebSearch: false },
    });

    const prompt = generate.mock.calls[0]![0] as string;

    expect(prompt).toContain("Previous card:");
    expect(prompt).toContain("Old Q");
    expect(prompt).toContain("Old A");
    expect(prompt).toContain("Learner instruction:\nshorter answer");
  });

  it("should send only the last 12 transcript messages", async () => {
    const transcript = Array.from({ length: 15 }, (_, i) => ({
      role: "user" as const,
      text: `message-${i}`,
    }));

    await draftKnowledgeBitChat("kb_1", { transcript, mode: "create" });

    const prompt = generate.mock.calls[0]![0] as string;

    expect(prompt).not.toContain("message-2\n");
    expect(prompt).toContain("message-3");
    expect(prompt).toContain("message-14");
  });

  it("returns draft_failed when the agent call fails", async () => {
    generate.mockRejectedValue(new Error("agent boom"));

    const result = await draftKnowledgeBitChat("kb_1", {
      transcript: [{ role: "user", text: "hi" }],
      mode: "edit",
    });

    expect(result).toEqual({ error: "draft_failed" });
  });

  it("returns draft_failed when the agent returns no structured card", async () => {
    generate.mockResolvedValue({ object: undefined });

    const result = await draftKnowledgeBitChat("kb_1", {
      transcript: [{ role: "user", text: "hi" }],
      mode: "edit",
    });

    expect(result).toEqual({ error: "draft_failed" });
  });

  it("returns draft_failed when the card breaks the field caps", async () => {
    generate.mockResolvedValue({ object: { front: "a".repeat(301), back: "A", example: null } });

    const result = await draftKnowledgeBitChat("kb_1", { transcript: [], mode: "create" });

    expect(result).toEqual({ error: "draft_failed" });
  });

  it("should make a single tool-less structured call and no sources when web is off", async () => {
    const result = await draftKnowledgeBitChat("kb_1", {
      transcript: [{ role: "user", text: "hi" }],
      mode: "create",
    });

    const options = generate.mock.calls[0]![1];

    expect(generate).toHaveBeenCalledTimes(1);
    expect(options.requestContext.get("allowWebSearch")).toBe(false);
    expect(options.requestContext.get("knowledgeBitChatDeps")).toBeUndefined();
    expect(options.structuredOutput).toBeDefined();
    expect(options).not.toHaveProperty("maxSteps");
    expect(webSearch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sources: [] });
  });

  it("should not enable web search when the instruction asks for it but allowWebSearch is off", async () => {
    await draftKnowledgeBitChat("kb_1", {
      transcript: [],
      mode: "create",
      instruction: "search the web and make a card",
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]![1].requestContext.get("allowWebSearch")).toBe(false);
    expect(generate.mock.calls[0]![1].requestContext.get("knowledgeBitChatDeps")).toBeUndefined();
  });

  it("should research with tools first then format with no tools, taking sources only from the tools", async () => {
    webSearch.mockResolvedValue({
      ok: true,
      text: "web text",
      citations: ["https://example.com/rfc", "javascript:alert(1)"],
    });
    generate
      .mockImplementationOnce(async (_prompt, opts) => {
        await opts.requestContext.get("knowledgeBitChatDeps").searchWeb("tcp rfc");

        return { text: "Notes: RFC 9293 defines the handshake." };
      })
      .mockResolvedValueOnce({
        object: {
          front: "Which RFC defines TCP?",
          back: "RFC 9293, see https://evil.example/fake",
          example: null,
        },
      });

    const result = await draftKnowledgeBitChat("kb_1", {
      transcript: [],
      mode: "create",
      allowWebSearch: true,
    });

    const [researchPrompt, researchOptions] = generate.mock.calls[0]!;
    const [cardPrompt, cardOptions] = generate.mock.calls[1]!;

    expect(generate).toHaveBeenCalledTimes(2);
    expect(researchOptions).toMatchObject({ maxSteps: 6 });
    expect(researchOptions.requestContext.get("allowWebSearch")).toBe(true);
    expect(researchPrompt).not.toContain("Research notes");
    expect(cardOptions.requestContext.get("allowWebSearch")).toBe(false);
    expect(cardOptions.requestContext.get("knowledgeBitChatDeps")).toBeUndefined();
    expect(cardOptions).not.toHaveProperty("maxSteps");
    expect(cardOptions.structuredOutput).toBeDefined();
    expect(cardPrompt).toContain("Notes: RFC 9293 defines the handshake.");
    expect(result).toMatchObject({
      sources: ["https://example.com/rfc"],
      card: { sources: ["https://example.com/rfc"], usedWebSearch: true },
    });
  });

  it("returns draft_failed when the research pass fails", async () => {
    generate.mockRejectedValue(new Error("search boom"));

    const result = await draftKnowledgeBitChat("kb_1", {
      transcript: [],
      mode: "create",
      allowWebSearch: true,
    });

    expect(result).toEqual({ error: "draft_failed" });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
