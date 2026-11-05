import { beforeEach, describe, expect, it, vi } from "vitest";
import { countRecentLlmCallEventsByOp } from "../llm-call-events/llm-call-events.repo.js";
import { runLongPasteSplitter } from "../mastra/long-paste-splitter.agent.js";
import { LlmBudgetExceededError, assertLlmBudgetAvailable } from "../shared/spend-guard.js";
import { splitLongPaste } from "./long-paste-split.orchestrator.js";

vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({ countRecentLlmCallEventsByOp: vi.fn() }));
vi.mock("../mastra/long-paste-splitter.agent.js", () => ({
  LONG_PASTE_SPLIT_OPERATION: "long_paste_split",
  runLongPasteSplitter: vi.fn(),
}));
vi.mock("../shared/spend-guard.js", async () => {
  const actual = await vi.importActual<typeof import("../shared/spend-guard.js")>("../shared/spend-guard.js");

  return { ...actual, assertLlmBudgetAvailable: vi.fn() };
});
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const FIRST = "First topic is about caches and their eviction. ".repeat(120);
const SECOND = "Second topic is about queues and their backlog. ".repeat(120);
const PASTE = `${FIRST}${SECOND}`;
const PLAN = {
  sections: [
    { title: "Caches", startQuote: "First topic is about caches" },
    { title: "Queues", startQuote: "Second topic is about queues" },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(countRecentLlmCallEventsByOp).mockResolvedValue(0);
  vi.mocked(assertLlmBudgetAvailable).mockResolvedValue(undefined);
  vi.mocked(runLongPasteSplitter).mockResolvedValue(PLAN);
});

describe("splitLongPaste", () => {
  it("should not call the model for a paste below 8,000 characters", async () => {
    expect(await splitLongPaste("short ".repeat(1_000))).toBeNull();
    expect(runLongPasteSplitter).not.toHaveBeenCalled();
  });

  it("should return verbatim parts for a good plan", async () => {
    const parts = await splitLongPaste(PASTE);

    expect(parts?.map((part) => part.title)).toEqual(["Caches", "Queues"]);
    expect(parts?.map((part) => part.text).join("")).toBe(PASTE);
  });

  it("should fall back to no split when the model times out", async () => {
    vi.mocked(runLongPasteSplitter).mockRejectedValue(new Error("long_paste_split_timeout"));

    expect(await splitLongPaste(PASTE)).toBeNull();
  });

  it("should fall back when the daily budget is used up, without calling the model", async () => {
    vi.mocked(assertLlmBudgetAvailable).mockRejectedValue(new LlmBudgetExceededError(5, 5));

    expect(await splitLongPaste(PASTE)).toBeNull();
    expect(runLongPasteSplitter).not.toHaveBeenCalled();
  });

  it("should fall back when the model returns an invalid plan", async () => {
    vi.mocked(runLongPasteSplitter).mockRejectedValue(new Error("long_paste_split_invalid_output"));

    expect(await splitLongPaste(PASTE)).toBeNull();
  });

  it("should fall back when the model quotes text that is not in the paste", async () => {
    vi.mocked(runLongPasteSplitter).mockResolvedValue({
      sections: [PLAN.sections[0]!, { title: "Invented", startQuote: "This sentence was never pasted" }],
    });

    expect(await splitLongPaste(PASTE)).toBeNull();
  });

  it("should fall back without a model call once 20 splits ran in the hour", async () => {
    vi.mocked(countRecentLlmCallEventsByOp).mockResolvedValue(20);

    expect(await splitLongPaste(PASTE)).toBeNull();
    expect(runLongPasteSplitter).not.toHaveBeenCalled();
  });
});
