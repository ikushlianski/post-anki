import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { generateItemsForSource, type GenerateItemsDeps } from "./detect-knowledge-bits.orchestrator.js";
import { chunkStep, type DurableSourceSnapshot, type DurableStepDeps } from "./durable-extraction.steps.js";
import { DEFAULT_LEARNING_INTENT } from "./knowledge-bit-learning-intent.js";
import { RU_EXAMPLE_ITEMS, RU_SOURCE_TEXT } from "./knowledge-bit-source-items.test-mocks.js";
import type { PendingKnowledgeSource } from "./knowledge-bit.repo.js";

const PENDING: PendingKnowledgeSource = {
  id: "ks_1",
  rawText: RU_SOURCE_TEXT,
  extractionModelId: null,
  subjectId: "sub_business",
  claimedAt: new Date(1),
};

function buildDeps(overrides: Partial<GenerateItemsDeps> = {}): GenerateItemsDeps {
  return {
    writeItems: vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS),
    getInsertState: vi.fn().mockResolvedValue({ nextOrdinal: 0, existingStatements: [] }),
    insertItems: vi.fn(async (input) => input.items.length),
    markDetected: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    loadFeedbackBlock: vi.fn().mockResolvedValue(""),
    loadStyleNotesBlock: vi.fn().mockResolvedValue(""),
    ...overrides,
  };
}

describe("learning intent in the extraction pipeline", () => {
  it("should judge a pasted source by the learning intent of its subject, loaded once for the whole source", async () => {
    const loadLearningIntent = vi.fn().mockResolvedValue("Learn sales principles.");
    const deps = buildDeps({ loadLearningIntent });

    await generateItemsForSource(PENDING, {}, deps);

    expect(loadLearningIntent).toHaveBeenCalledTimes(1);
    expect(loadLearningIntent).toHaveBeenCalledWith("sub_business");
    expect(deps.writeItems).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ learningIntent: "Learn sales principles." }),
    );
  });

  it("should still extract with the default intent when the subject intent cannot be loaded", async () => {
    const deps = buildDeps({ loadLearningIntent: vi.fn().mockRejectedValue(new Error("db down")) });

    const result = await generateItemsForSource(PENDING, {}, deps);

    expect(result.status).toBe("detected");
    expect(deps.writeItems).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ learningIntent: DEFAULT_LEARNING_INTENT }),
    );
  });

  it("should use the default intent when the stored intent is blank", async () => {
    const deps = buildDeps({ loadLearningIntent: vi.fn().mockResolvedValue("   ") });

    await generateItemsForSource(PENDING, {}, deps);

    expect(deps.writeItems).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ learningIntent: DEFAULT_LEARNING_INTENT }),
    );
  });

  it("should keep sending reviewer feedback and style notes next to the intent", async () => {
    const deps = buildDeps({
      loadFeedbackBlock: vi.fn().mockResolvedValue("<reviewer_feedback>x</reviewer_feedback>"),
      loadStyleNotesBlock: vi.fn().mockResolvedValue("<style_notes>y</style_notes>"),
      loadLearningIntent: vi.fn().mockResolvedValue("Learn sales principles."),
    });

    await generateItemsForSource(PENDING, {}, deps);

    expect(deps.writeItems).toHaveBeenCalledWith(expect.any(String), {
      learningIntent: "Learn sales principles.",
      feedbackBlock: "<reviewer_feedback>x</reviewer_feedback>",
      styleNotesBlock: "<style_notes>y</style_notes>",
    });
  });

  it("should apply the subject intent on the durable path as well", async () => {
    const snapshot: DurableSourceSnapshot = {
      id: "ks_1",
      extractionModelId: null,
      subjectId: "sub_business",
      claimedAt: new Date(1).toISOString(),
    };
    const deps: DurableStepDeps = {
      ...buildDeps({ loadLearningIntent: vi.fn().mockResolvedValue("Learn sales principles.") }),
      claimOrLoad: vi.fn(),
      loadRawText: vi.fn().mockResolvedValue(RU_SOURCE_TEXT),
    };

    await chunkStep(snapshot, 0, deps);

    expect(deps.writeItems).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ learningIntent: "Learn sales principles." }),
    );
  });
});
