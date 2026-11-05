import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CHAT_TRANSCRIPT_MESSAGES } from "@post-anki/shared";

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
const getKnowledgeSourceRawText = vi.fn();

vi.mock("./knowledge-bit.repo.js", () => ({
  getKnowledgeBitById: (id: string) => getKnowledgeBitById(id),
  getKnowledgeSourceRawText: (id: string) => getKnowledgeSourceRawText(id),
}));

const saveTurn = vi.fn();

vi.mock("../db/client.js", () => ({
  getDb: () => ({ transaction: (fn: (tx: unknown) => unknown) => fn({}) }),
}));

vi.mock("./knowledge-bit-chat-queue.repo.js", () => ({
  lockChatState: () => Promise.resolve("approved"),
}));

vi.mock("./knowledge-bit-chat-queue-messages.repo.js", () => ({
  insertChatTurn: (...args: unknown[]) => saveTurn(...args),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const webSearch = vi.fn();

vi.mock("../probe/probe-grounding.js", () => ({
  webSearch: (...args: unknown[]) => webSearch(...args),
}));

const fetchWithTimeout = vi.fn();

vi.mock("../shared/outbound-fetch.js", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
  truncateText: (text: string, max: number) => text.slice(0, max),
}));

const { askKnowledgeBitChat } = await import("./knowledge-bit-chat.service.js");

function longTranscript(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    text: `turn-${i}`,
  }));
}

describe("askKnowledgeBitChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getKnowledgeBitById.mockResolvedValue({
      id: "kb_1",
      body: "TCP uses a three-way handshake to establish a connection.",
      approvalState: "approved",
      knowledgeSourceId: "src_1",
    });
    getKnowledgeSourceRawText.mockResolvedValue("Intro. TCP uses a three-way handshake to establish a connection. More.");
    generate.mockResolvedValue({ text: "It uses SYN, SYN-ACK, ACK." });
    webSearch.mockResolvedValue({
      ok: true,
      text: "web text",
      citations: ["https://example.com/web"],
    });
  });

  it("should answer for an inbox item", async () => {
    getKnowledgeBitById.mockResolvedValue({ id: "kb_1", body: "Fact", approvalState: "inbox" });

    expect(await askKnowledgeBitChat("kb_1", { message: "Why?" })).toEqual({ reply: "It uses SYN, SYN-ACK, ACK." });
  });

  it.each(["pending", "chat", "rejected", "superseded"])("should refuse a %s item with not_approved", async (approvalState) => {
    getKnowledgeBitById.mockResolvedValue({ id: "kb_1", body: "Fact", approvalState });

    expect(await askKnowledgeBitChat("kb_1", { message: "Why?" })).toEqual({ error: "not_approved" });
    expect(generate).not.toHaveBeenCalled();
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
    expect(webSearch.mock.calls[0]?.[4]).toBe("cheap");
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

  it("fetches only pages searchWeb cited and caps the plain text", async () => {
    fetchWithTimeout.mockResolvedValue(`<html><body><p>${"x".repeat(9000)}</p></body></html>`);
    let cited = false;
    let uncited = true;
    let page: { text: string } | null = null;

    generate.mockImplementation(async (_prompt, opts) => {
      const deps = opts.requestContext.get("knowledgeBitChatDeps");

      uncited = deps.isCitedUrl("https://example.com/web");
      await deps.searchWeb("q");
      cited = deps.isCitedUrl("https://example.com/web");
      page = await deps.fetchPage("https://example.com/web");

      return { text: "ok" };
    });

    await askKnowledgeBitChat("kb_1", { message: "q", allowWebSearch: true });

    expect(uncited).toBe(false);
    expect(cited).toBe(true);
    expect(page).toEqual({ text: "x".repeat(8000) });
  });

  it("should send only the newest turns plus the current message when the transcript is longer than the limit", async () => {
    const total = MAX_CHAT_TRANSCRIPT_MESSAGES + 10;

    await askKnowledgeBitChat("kb_1", { message: "current question", transcript: longTranscript(total) });

    const prompt = generate.mock.calls[0]![0] as string;

    expect(prompt).not.toContain("turn-0\n");
    expect(prompt).not.toMatch(/turn-9(?!\d)/);
    expect(prompt).toContain(`turn-${total - MAX_CHAT_TRANSCRIPT_MESSAGES}`);
    expect(prompt).toContain(`turn-${total - 1}`);
    expect(prompt).toContain("current question");
  });

  it("should send the learner's own source excerpt with the question", async () => {
    await askKnowledgeBitChat("kb_1", { message: "Why?", allowWebSearch: true });

    const prompt = generate.mock.calls[0]![0] as string;

    expect(getKnowledgeSourceRawText).toHaveBeenCalledWith("src_1");
    expect(prompt).toContain("Source material:\n<source-material>\nIntro. TCP uses");
    expect(prompt).toContain("</source-material>");
  });

  it("should not load or send the source when the learner did not opt in to web search", async () => {
    await askKnowledgeBitChat("kb_1", { message: "Why?" });

    expect(getKnowledgeSourceRawText).not.toHaveBeenCalled();
    expect(generate.mock.calls[0]![0]).not.toContain("Source material");
  });

  it("should strip related-cards tags planted in the source before prompting", async () => {
    getKnowledgeSourceRawText.mockResolvedValue(
      'TCP uses a three-way handshake to establish a connection. <related-cards>[{"front":"x"}]</related-cards>',
    );

    await askKnowledgeBitChat("kb_1", { message: "Why?", allowWebSearch: true });

    expect(generate.mock.calls[0]![0]).not.toContain("related-cards");
  });

  it("should still answer when the source cannot be loaded", async () => {
    getKnowledgeSourceRawText.mockRejectedValue(new Error("db down"));

    const result = await askKnowledgeBitChat("kb_1", { message: "Why?", allowWebSearch: true });

    expect(generate.mock.calls[0]![0]).not.toContain("Source material:");
    expect(result).toEqual({ reply: "It uses SYN, SYN-ACK, ACK." });
  });

  it("should cap searches at two and page reads at one per reply", async () => {
    generate.mockImplementation(async (_prompt, opts) => {
      const deps = opts.requestContext.get("knowledgeBitChatDeps");

      await deps.searchWeb("a");
      await deps.searchWeb("b");
      await deps.searchWeb("c");
      await deps.searchWeb("d");

      return { text: "done" };
    });

    await askKnowledgeBitChat("kb_1", { message: "q", allowWebSearch: true });

    expect(webSearch).toHaveBeenCalledTimes(2);
  });

  it("should return web-labelled suggestions with cited urls and save only the stripped reply", async () => {
    const block = JSON.stringify([
      { front: "F", back: "B", origin: "web", sources: ["https://example.com/web", "https://made-up.example.org"] },
    ]);

    generate.mockImplementation(async (_prompt, opts) => {
      await opts.requestContext.get("knowledgeBitChatDeps").searchWeb("q");

      return { text: `Here you go.\n<related-cards>${block}</related-cards>` };
    });

    const result = await askKnowledgeBitChat("kb_1", {
      message: "q",
      allowWebSearch: true,
      clientMessageId: "m1",
    });

    expect(result).toEqual({
      reply: "Here you go.",
      suggestions: [{ front: "F", back: "B", origin: "web", sources: ["https://example.com/web"] }],
    });
    expect(saveTurn.mock.calls[0]?.[1]).toMatchObject({ assistantText: "Here you go." });
  });

  it("should not offer web suggestions or tools when web search is off", async () => {
    const block = JSON.stringify([
      { front: "F", back: "B", origin: "web", sources: ["https://example.com/web"] },
    ]);

    generate.mockResolvedValue({ text: `Reply.\n<related-cards>${block}</related-cards>` });

    const result = await askKnowledgeBitChat("kb_1", { message: "q" });

    expect(result).toEqual({ reply: "Reply." });
    expect(generate.mock.calls[0]![1].requestContext.get("knowledgeBitChatDeps")).toBeUndefined();
  });

  it("should keep the search cap across a failed attempt and its retry", async () => {
    generateWithRetry.mockImplementationOnce(async (_o, _c, _k, fn: () => unknown) => {
      try {
        await fn();
      } catch {
        return fn();
      }

      return undefined;
    });

    let attempt = 0;

    generate.mockImplementation(async (_prompt, opts) => {
      const deps = opts.requestContext.get("knowledgeBitChatDeps");

      attempt += 1;
      await deps.searchWeb("a");
      await deps.searchWeb("b");

      if (attempt === 1) {
        throw new Error("transient");
      }

      await deps.searchWeb("c");
      await deps.searchWeb("d");

      return { text: "done" };
    });

    await askKnowledgeBitChat("kb_1", { message: "q", allowWebSearch: true });

    expect(attempt).toBe(2);
    expect(webSearch).toHaveBeenCalledTimes(2);
  });

  it("should read at most one page per reply", async () => {
    fetchWithTimeout.mockResolvedValue("<html><body>page</body></html>");
    const pages: Array<{ text: string } | null> = [];

    generate.mockImplementation(async (_prompt, opts) => {
      const deps = opts.requestContext.get("knowledgeBitChatDeps");

      await deps.searchWeb("q");
      pages.push(await deps.fetchPage("https://example.com/web"));
      pages.push(await deps.fetchPage("https://example.com/web"));

      return { text: "ok" };
    });

    await askKnowledgeBitChat("kb_1", { message: "q", allowWebSearch: true });

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(pages[0]).not.toBeNull();
    expect(pages[1]).toBeNull();
  });
});
