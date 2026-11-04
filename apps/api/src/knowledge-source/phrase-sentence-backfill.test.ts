import { describe, expect, it } from "vitest";
import { parsePhraseBackfillArgs, splitPromptContext } from "./phrase-sentence-backfill.js";

describe("parsePhraseBackfillArgs", () => {
  it("should run as a dry run unless apply is asked for", () => {
    expect(parsePhraseBackfillArgs([])).toEqual({ apply: false, allowRemote: false, splitOnly: false, limit: undefined });
    expect(parsePhraseBackfillArgs(["--apply", "--limit", "100"]).apply).toBe(true);
  });

  it("should refuse a limit that is not a positive whole number", () => {
    expect(() => parsePhraseBackfillArgs(["--limit", "0"])).toThrow();
    expect(() => parsePhraseBackfillArgs(["--limit"])).toThrow();
  });
});

describe("parsePhraseBackfillArgs split-only", () => {
  it("should split fronts without calling the model when split-only is asked for", () => {
    expect(parsePhraseBackfillArgs(["--split-only"]).splitOnly).toBe(true);
  });
});

describe("splitPromptContext", () => {
  it("should move the second line of a two-line front into the context", () => {
    expect(splitPromptContext("Formal moment\nsenior dev talking to their manager")).toEqual({
      prompt: "Formal moment",
      context: "senior dev talking to their manager",
    });
  });

  it("should leave a single-line front alone", () => {
    expect(splitPromptContext("Formal moment")).toBeNull();
  });

  it("should leave a front with three or more lines alone", () => {
    expect(splitPromptContext("a\nb\nc")).toBeNull();
  });
});
