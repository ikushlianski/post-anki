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

const { draftKnowledgeBitChat } = await import("./knowledge-bit-chat-draft.service.js");

describe("draftKnowledgeBitChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getKnowledgeBitById.mockResolvedValue({
      id: "kb_1",
      body: "TCP uses a three-way handshake to establish a connection.",
    });
    generate.mockResolvedValue({ text: "TCP uses a three-way handshake with SYN, SYN-ACK, ACK." });
  });

  it("returns not_found and never calls the model when the bit does not exist", async () => {
    getKnowledgeBitById.mockResolvedValue(null);

    const result = await draftKnowledgeBitChat("missing", {
      transcript: [{ role: "user", text: "What starts the handshake?" }],
      mode: "edit",
    });

    expect(result).toEqual({ error: "not_found" });
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

  it("returns the proposed body from the agent", async () => {
    const result = await draftKnowledgeBitChat("kb_1", {
      transcript: [{ role: "user", text: "hi" }],
      mode: "edit",
    });

    expect(result).toEqual({
      proposedBody: "TCP uses a three-way handshake with SYN, SYN-ACK, ACK.",
    });
  });

  it("returns draft_failed when the agent call fails", async () => {
    generate.mockRejectedValue(new Error("agent boom"));

    const result = await draftKnowledgeBitChat("kb_1", {
      transcript: [{ role: "user", text: "hi" }],
      mode: "edit",
    });

    expect(result).toEqual({ error: "draft_failed" });
  });

  it("returns draft_failed when the agent returns empty text", async () => {
    generate.mockResolvedValue({ text: "   " });

    const result = await draftKnowledgeBitChat("kb_1", {
      transcript: [{ role: "user", text: "hi" }],
      mode: "edit",
    });

    expect(result).toEqual({ error: "draft_failed" });
  });
});
