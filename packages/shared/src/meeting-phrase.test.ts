import { describe, expect, it } from "vitest";
import { createPhraseSourcesInput, MAX_PHRASE_LINE_LENGTH } from "./meeting-phrase";

describe("createPhraseSourcesInput", () => {
  it("should accept a batch that holds one over-long line so the other phrases still import", () => {
    const parsed = createPhraseSourcesInput.safeParse({
      lines: ["touch base", "x".repeat(MAX_PHRASE_LINE_LENGTH + 1)],
    });

    expect(parsed.success).toBe(true);
  });

  it("should still refuse an empty batch", () => {
    expect(createPhraseSourcesInput.safeParse({ lines: [] }).success).toBe(false);
  });
});
