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
      object: { bits: ["Bit one.", "Bit two."] },
    });

    const bits = await runKnowledgeBitDetector("Some source prose to extract from.");

    expect(bits).toEqual(["Bit one.", "Bit two."]);
    expect(generateMock).toHaveBeenCalledTimes(1);

    const [prompt] = generateMock.mock.calls[0] as [string, unknown];

    expect(prompt).toContain("<source>");
    expect(prompt).toContain("</source>");
    expect(prompt).toContain("Some source prose to extract from.");
  });

  it("throws when the agent returns an output that fails schema validation", async () => {
    generateMock.mockResolvedValueOnce({ object: { bits: [] } });

    await expect(runKnowledgeBitDetector("Some source text.")).rejects.toThrow(
      "knowledge_bit_detector_invalid_output",
    );
  });
});
