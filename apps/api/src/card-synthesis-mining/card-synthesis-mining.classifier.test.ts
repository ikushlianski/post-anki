import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../mastra/card-synthesis-classifier.agent.js", () => ({ runCardSynthesisClassifier: vi.fn() }));

import { runCardSynthesisClassifier } from "../mastra/card-synthesis-classifier.agent.js";
import { classifyCluster } from "./card-synthesis-mining.classifier.js";

const cards = [{ id: "kb_1", question: "q", answer: "a" }];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("classifyCluster", () => {
  it("should return a sanitised title for a chain", async () => {
    vi.mocked(runCardSynthesisClassifier).mockResolvedValue({
      isChain: true,
      title: "What is the <i>cold-call</i> sequence?",
      reason: "steps",
    });

    await expect(classifyCluster(cards, {})).resolves.toEqual({
      isChain: true,
      title: "What is the cold-call sequence?",
      reason: "steps",
    });
  });

  it("should drop any title when the cluster is not a chain", async () => {
    vi.mocked(runCardSynthesisClassifier).mockResolvedValue({ isChain: false, title: "leftover", reason: "unrelated" });

    expect((await classifyCluster(cards, {})).title).toBe("");
  });

  it("should reject a chain verdict that has no usable title", async () => {
    vi.mocked(runCardSynthesisClassifier).mockResolvedValue({ isChain: true, title: " ", reason: "x" });

    await expect(classifyCluster(cards, {})).rejects.toThrow("invalid_output");
  });
});
