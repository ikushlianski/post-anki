import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { qaChat: "qaChat" },
  getMastra: () => ({ getAgent: () => ({ generate }) }),
}));

vi.mock("../mastra/generate-with-retry.js", () => ({
  generateWithRetry: (_op: unknown, _curriculumId: unknown, _agentKey: unknown, fn: () => unknown) =>
    fn(),
}));

const getTopicRow = vi.fn();

vi.mock("../topic/topic-progress.repo.js", () => ({
  getTopicRow: (id: string) => getTopicRow(id),
}));

const getCurriculumContextForTopic = vi.fn();
const getCurriculumPromptContext = vi.fn();
const getModuleProgressSnapshots = vi.fn();

vi.mock("../curriculum/curriculum.repo.js", () => ({
  getCurriculumContextForTopic: (id: string) => getCurriculumContextForTopic(id),
  getCurriculumPromptContext: (id: string) => getCurriculumPromptContext(id),
  getModuleProgressSnapshots: (id: string) => getModuleProgressSnapshots(id),
}));

const webSearch = vi.fn();

vi.mock("../probe/probe-grounding.js", () => ({
  webSearch: (...args: unknown[]) => webSearch(...args),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { askQaChat } = await import("./qa-chat.service.js");

const TOPIC = { id: "t1", title: "TLS termination", summary: "ends encryption at the edge" };
const CURRICULUM_CTX = {
  curriculumId: "c1",
  status: "confirmed",
  speed: "normal",
  hinting: false,
};
const PROMPT_CTX = {
  curriculumName: "Networking",
  curriculumDescription: null,
  subjectName: "Architecture",
  subjectDescription: null,
  subjectKind: "architecture-mentor",
};

describe("askQaChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTopicRow.mockResolvedValue(TOPIC);
    getCurriculumContextForTopic.mockResolvedValue(CURRICULUM_CTX);
    getCurriculumPromptContext.mockResolvedValue(PROMPT_CTX);
    getModuleProgressSnapshots.mockResolvedValue([
      {
        moduleId: "m1",
        title: "Networking",
        learningStatus: "in_progress",
        mergedFromCurriculumId: null,
        topics: [{ title: "TLS termination" }, { title: "TCP handshake" }],
      },
    ]);
    webSearch.mockResolvedValue({ ok: true, text: "web text", citations: ["https://example.com/web"] });
  });

  it("answers a topic-grounded question without ever reaching the web", async () => {
    generate.mockResolvedValue({ text: "TLS ends encryption at the load balancer." });

    const result = await askQaChat({ topicId: "t1", message: "Where does TLS end?" });

    expect(webSearch).not.toHaveBeenCalled();
    expect(result).toEqual({ reply: "TLS ends encryption at the load balancer." });
  });

  it("answers a curriculum-scoped question without a topic id", async () => {
    generate.mockResolvedValue({ text: "Answer about the course." });

    const result = await askQaChat({ curriculumId: "c1", message: "What's next?" });

    expect(getTopicRow).not.toHaveBeenCalled();
    expect(webSearch).not.toHaveBeenCalled();
    expect(result).toEqual({ reply: "Answer about the course." });
  });

  it("surfaces the sub-topics and citations the agent's tools recorded", async () => {
    generate.mockImplementation(async (_prompt, opts) => {
      const deps = opts.requestContext.get("qaChatDeps");

      deps.state.suggestedSubtopics = [{ title: "QUIC", rationale: "current transport" }];
      deps.state.citations = ["https://example.com/src"];

      return { text: "I'd add QUIC next." };
    });

    const result = await askQaChat({ topicId: "t1", message: "Grow my course" });

    expect(result).toEqual({
      reply: "I'd add QUIC next.",
      suggestedSubtopics: [{ title: "QUIC", rationale: "current transport" }],
      citations: ["https://example.com/src"],
    });
  });

  it("reaches the web only when the agent opts into the search tool, scoped to the curriculum", async () => {
    generate.mockImplementation(async (_prompt, opts) => {
      const deps = opts.requestContext.get("qaChatDeps");

      await deps.searchWeb("current best practice");

      return { text: "Current guidance says…" };
    });

    await askQaChat({ topicId: "t1", message: "What changed recently?" });

    expect(webSearch).toHaveBeenCalledTimes(1);
    expect(webSearch.mock.calls[0]?.[3]).toEqual({ curriculumId: "c1" });
  });

  it("returns not_found when the topic does not exist", async () => {
    getTopicRow.mockResolvedValue(null);

    const result = await askQaChat({ topicId: "missing", message: "hi" });

    expect(result).toEqual({ error: "not_found" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns not_found when the curriculum does not exist", async () => {
    getCurriculumPromptContext.mockResolvedValue(null);

    const result = await askQaChat({ curriculumId: "missing", message: "hi" });

    expect(result).toEqual({ error: "not_found" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("falls back to a safe reply when the agent call fails", async () => {
    generate.mockRejectedValue(new Error("agent boom"));

    const result = await askQaChat({ topicId: "t1", message: "hi" });

    expect(result).toEqual({ reply: "I couldn't reach the tutor right now — try again." });
  });
});
