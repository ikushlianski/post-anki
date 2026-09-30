import { describe, expect, it, vi } from "vitest";

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./mastra.js", () => ({
  getMastra: vi.fn().mockReturnValue({
    getAgent: vi.fn().mockReturnValue({ generate: generateMock }),
  }),
  AGENT_KEYS: { knowledgeBitDetector: "knowledgeBitDetector" },
}));

vi.mock("../shared/env.js", () => ({
  loadEnv: vi.fn().mockReturnValue({ OPENROUTER_BASE_URL: undefined }),
}));

vi.mock("./generate-with-retry.js", () => ({
  generateWithRetry: vi.fn((_op: string, _curriculumId: unknown, _agentKey: string, fn: () => unknown) => fn()),
}));

import {
  buildKnowledgeBitDetectorPrompt,
  runKnowledgeBitDetector,
} from "./knowledge-bit-detector.agent.js";

describe("buildKnowledgeBitDetectorPrompt", () => {
  it("wraps the source text in <source> delimiters", () => {
    const prompt = buildKnowledgeBitDetectorPrompt("Photosynthesis converts light into energy.");

    expect(prompt).toContain("<source>");
    expect(prompt).toContain("</source>");
    expect(prompt).toContain("Photosynthesis converts light into energy.");
    expect(prompt.indexOf("<source>")).toBeLessThan(prompt.indexOf("Photosynthesis"));
    expect(prompt.indexOf("Photosynthesis")).toBeLessThan(prompt.indexOf("</source>"));
  });
});

describe("runKnowledgeBitDetector", () => {
  it("passes the delimited prompt to the agent and parses a valid response into bits", async () => {
    generateMock.mockResolvedValueOnce({
      object: {
        bits: [
          { text: "Bit one.", background: null },
          { text: "Bit two.", background: null },
        ],
      },
    });

    const bits = await runKnowledgeBitDetector("Some source prose to extract from.");

    expect(bits).toEqual([
      { text: "Bit one.", background: null },
      { text: "Bit two.", background: null },
    ]);
    expect(generateMock).toHaveBeenCalledTimes(1);

    const [prompt] = generateMock.mock.calls[0] as [string, unknown];

    expect(prompt).toContain("<source>");
    expect(prompt).toContain("</source>");
    expect(prompt).toContain("Some source prose to extract from.");
  });

  it("keeps a non-null background for a bit that genuinely needs nearby context", async () => {
    generateMock.mockResolvedValueOnce({
      object: {
        bits: [
          {
            text: "It reduces build times by 40%.",
            background: "Refers to the caching layer discussed earlier in the source.",
          },
        ],
      },
    });

    const bits = await runKnowledgeBitDetector("Some source prose to extract from.");

    expect(bits).toEqual([
      {
        text: "It reduces build times by 40%.",
        background: "Refers to the caching layer discussed earlier in the source.",
      },
    ]);
  });

  it("normalizes an explicit null background for a self-contained bit", async () => {
    generateMock.mockResolvedValueOnce({
      object: {
        bits: [{ text: "Photosynthesis converts light into chemical energy.", background: null }],
      },
    });

    const bits = await runKnowledgeBitDetector("Some source prose to extract from.");

    expect(bits).toEqual([
      { text: "Photosynthesis converts light into chemical energy.", background: null },
    ]);
  });

  it("throws when the agent returns an output that fails schema validation", async () => {
    generateMock.mockResolvedValueOnce({ object: { bits: [] } });

    await expect(runKnowledgeBitDetector("Some source text.")).rejects.toThrow(
      "knowledge_bit_detector_invalid_output",
    );
  });

  it("throws when a bit is missing its required text field", async () => {
    generateMock.mockResolvedValueOnce({
      object: { bits: [{ background: "Some context but no text." }] },
    });

    await expect(runKnowledgeBitDetector("Some source text.")).rejects.toThrow(
      "knowledge_bit_detector_invalid_output",
    );
  });

  it("accepts a response with exactly 20 bits", async () => {
    const bits = Array.from({ length: 20 }, (_, index) => ({
      text: `Bit number ${index + 1}.`,
      background: null,
    }));

    generateMock.mockResolvedValueOnce({ object: { bits } });

    const result = await runKnowledgeBitDetector("Some source text.");

    expect(result).toEqual(bits);
  });

  it("throws when the agent returns more than 20 bits", async () => {
    const bits = Array.from({ length: 21 }, (_, index) => ({
      text: `Bit number ${index + 1}.`,
      background: null,
    }));

    generateMock.mockResolvedValueOnce({ object: { bits } });

    await expect(runKnowledgeBitDetector("Some source text.")).rejects.toThrow(
      "knowledge_bit_detector_invalid_output",
    );
  });
});
