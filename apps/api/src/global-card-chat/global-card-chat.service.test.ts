import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { globalCardChat: "globalCardChat" },
  getMastra: () => ({ getAgent: () => ({ generate }) }),
}));

vi.mock("../mastra/generate-with-retry.js", () => ({
  generateWithRetry: (_op: unknown, _curriculumId: unknown, _agentKey: unknown, fn: () => unknown) =>
    fn(),
}));

const findTopMatchingCards = vi.fn();

vi.mock("../cards/cards-retrieval.orchestrator.js", () => ({
  findTopMatchingCards: (...args: unknown[]) => findTopMatchingCards(...args),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { askGlobalCardChat } = await import("./global-card-chat.service.js");

const MATCHED_CARDS = [
  {
    variantId: "v1",
    kind: "card" as const,
    prompt: "What is a closure?",
    answer: "A function bundled with its lexical scope.",
    topicId: "t1",
    topicTitle: "JS fundamentals",
    similarity: 0.9,
    subjectId: "s1",
    subjectName: "JavaScript",
    tags: [],
    domainNodeNames: [],
  },
];

const LONG_FACT_BODY =
  "Pricing pages convert best when the anchor plan sits in the middle and the annual toggle is on by default, per the SaaS playbook";

const MATCHED_FACT = {
  variantId: "fact_1",
  kind: "fact" as const,
  prompt: LONG_FACT_BODY,
  answer: "",
  topicId: "facts",
  topicTitle: "Reading notes",
  similarity: 0.95,
  subjectId: "",
  subjectName: "",
  tags: ["SPA"],
  domainNodeNames: [],
};

describe("askGlobalCardChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findTopMatchingCards.mockResolvedValue(MATCHED_CARDS);
    generate.mockResolvedValue({ text: "A closure bundles a function with its scope." });
  });

  it("builds the prompt only from the learner's matched cards, never outside facts", async () => {
    await askGlobalCardChat({ message: "What is a closure?" });

    const prompt = generate.mock.calls[0]![0] as string;

    expect(prompt).toContain("What is a closure?");
    expect(prompt).toContain("A function bundled with its lexical scope.");
    expect(prompt).not.toContain("scope chain");
  });

  it("returns the matched cards' display data alongside the reply for later grounding display", async () => {
    const result = await askGlobalCardChat({ message: "What is a closure?" });

    expect(result.matchedCards).toEqual([
      { variantId: "v1", prompt: "What is a closure?", topicTitle: "JS fundamentals" },
    ]);
    expect(result.reply).toBe("A closure bundles a function with its scope.");
  });

  it("still replies, with no matched cards, when the learner's deck has no coverage", async () => {
    findTopMatchingCards.mockResolvedValue([]);
    generate.mockResolvedValue({ text: "Your cards don't cover this yet." });

    const result = await askGlobalCardChat({ message: "What is quantum tunneling?" });

    const prompt = generate.mock.calls[0]![0] as string;

    expect(prompt).toContain("no cards matching");
    expect(result.matchedCards).toEqual([]);
    expect(result.reply).toBe("Your cards don't cover this yet.");
  });

  it("falls back to a stock reply when the agent returns no text", async () => {
    generate.mockResolvedValue({ text: "" });

    const result = await askGlobalCardChat({ message: "What is a closure?" });

    expect(result.reply).toBe("I couldn't reach the tutor right now — try again.");
    expect(result.matchedCards).toEqual([
      { variantId: "v1", prompt: "What is a closure?", topicTitle: "JS fundamentals" },
    ]);
  });

  it("falls back to a stock reply when the agent call throws", async () => {
    generate.mockRejectedValue(new Error("network down"));

    const result = await askGlobalCardChat({ message: "What is a closure?" });

    expect(result.reply).toBe("I couldn't reach the tutor right now — try again.");
  });

  it("still replies with fallback when card lookup fails", async () => {
    findTopMatchingCards.mockRejectedValue(new Error("embeddings API down"));
    generate.mockResolvedValue({ text: "I couldn't find your cards, but here's a general answer." });

    const result = await askGlobalCardChat({ message: "What is a closure?" });

    expect(result.reply).toBe("I couldn't find your cards, but here's a general answer.");
    expect(result.matchedCards).toEqual([]);
  });

  it("defaults the agent to cards-only when allowGeneralKnowledge is omitted", async () => {
    await askGlobalCardChat({ message: "What is a closure?" });

    const { requestContext } = generate.mock.calls[0]![1];

    expect(requestContext.get("allowGeneralKnowledge")).toBe(false);
  });

  it("passes allowGeneralKnowledge through to the agent when explicitly set", async () => {
    await askGlobalCardChat({ message: "What is a closure?", allowGeneralKnowledge: true });

    const { requestContext } = generate.mock.calls[0]![1];

    expect(requestContext.get("allowGeneralKnowledge")).toBe(true);
  });

  it("presents a reading note to the agent as a fact, not a question and answer", async () => {
    findTopMatchingCards.mockResolvedValue([MATCHED_FACT]);

    await askGlobalCardChat({ message: "How should I lay out a pricing page?" });

    const prompt = generate.mock.calls[0]![0] as string;

    expect(prompt).toContain(`- Fact: ${LONG_FACT_BODY}`);
    expect(prompt).not.toContain("A: ");
  });

  it("shows a reading note in the grounding by a short preview under Reading notes", async () => {
    findTopMatchingCards.mockResolvedValue([MATCHED_FACT]);

    const result = await askGlobalCardChat({ message: "How should I lay out a pricing page?" });

    expect(result.matchedCards).toEqual([
      {
        variantId: "fact_1",
        prompt: `${LONG_FACT_BODY.slice(0, 80)}…`,
        topicTitle: "Reading notes",
      },
    ]);
  });
});
