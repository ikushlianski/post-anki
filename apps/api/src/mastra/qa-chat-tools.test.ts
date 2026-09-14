import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { suggestSubtopicsFor, searchWebFor } = await import("./qa-chat-tools.js");

function makeDeps(overrides: Partial<Parameters<typeof suggestSubtopicsFor>[1]> = {}) {
  return {
    state: { suggestedSubtopics: null, citations: [] },
    curriculumId: "c1",
    listExistingTopicTitles: vi.fn().mockResolvedValue([]),
    searchWeb: vi.fn().mockResolvedValue({ text: "", citations: [] }),
    ...overrides,
  };
}

describe("suggestSubtopics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a proposal into in-memory state without touching existing topics", async () => {
    const existing = ["tcp handshake", "tls termination"];
    const deps = makeDeps({
      listExistingTopicTitles: vi.fn().mockResolvedValue(existing),
    });

    const result = await suggestSubtopicsFor(
      {
        moduleTitle: "Networking",
        suggestions: [
          { title: "HTTP/2 flow control", rationale: "builds on TLS" },
          { title: "QUIC", rationale: "current transport" },
        ],
      },
      deps,
    );

    expect(result).toEqual({ ok: true, recorded: 2 });
    expect(deps.listExistingTopicTitles).toHaveBeenCalledTimes(1);
    expect(deps.state.suggestedSubtopics).toEqual([
      { title: "HTTP/2 flow control", rationale: "builds on TLS" },
      { title: "QUIC", rationale: "current transport" },
    ]);
  });

  it("rejects a suggestion whose title already exists in the course", async () => {
    const deps = makeDeps({
      listExistingTopicTitles: vi.fn().mockResolvedValue(["quic"]),
    });

    const result = await suggestSubtopicsFor(
      {
        suggestions: [
          { title: "QUIC", rationale: "already there" },
          { title: "HTTP/3", rationale: "new" },
        ],
      },
      deps,
    );

    expect(result).toEqual({ ok: false, error: "already in this course: QUIC" });
    expect(deps.state.suggestedSubtopics).toBeNull();
  });

  it("refuses to suggest when no curriculum is in context", async () => {
    const deps = makeDeps({ curriculumId: null });

    const result = await suggestSubtopicsFor(
      { suggestions: [{ title: "Anything", rationale: "no anchor" }] },
      deps,
    );

    expect(result).toEqual({
      ok: false,
      error: "no curriculum in context to suggest sub-topics for",
    });
    expect(deps.listExistingTopicTitles).not.toHaveBeenCalled();
    expect(deps.state.suggestedSubtopics).toBeNull();
  });
});

describe("searchWeb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters unsafe citation URLs before recording them", async () => {
    const deps = makeDeps({
      searchWeb: vi.fn().mockResolvedValue({
        text: "web grounding",
        citations: [
          "https://example.com/real-source",
          "javascript:alert(1)",
          "http://169.254.169.254/latest/meta-data",
        ],
      }),
    });

    const result = await searchWebFor({ query: "current best practice" }, deps);

    expect(result).toEqual({
      ok: true,
      text: "web grounding",
      citations: ["https://example.com/real-source"],
    });
    expect(deps.state.citations).toEqual(["https://example.com/real-source"]);
  });

  it("deduplicates citations across repeated searches", async () => {
    const deps = makeDeps({
      searchWeb: vi.fn().mockResolvedValue({
        text: "web grounding",
        citations: ["https://example.com/a", "https://example.com/a"],
      }),
    });

    await searchWebFor({ query: "one" }, deps);
    await searchWebFor({ query: "two" }, deps);

    expect(deps.state.citations).toEqual(["https://example.com/a"]);
  });

  it("only reaches the web when the agent opts into this tool", async () => {
    const deps = makeDeps();

    expect(deps.searchWeb).not.toHaveBeenCalled();

    await searchWebFor({ query: "something current" }, deps);

    expect(deps.searchWeb).toHaveBeenCalledTimes(1);
    expect(deps.searchWeb).toHaveBeenCalledWith("something current");
  });
});
