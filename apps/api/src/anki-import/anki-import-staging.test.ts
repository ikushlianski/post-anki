import { describe, expect, it } from "vitest";
import { buildStagedNotes } from "./anki-import-staging.js";
import { MAX_IMPORT_NOTES } from "./anki-import.limits.js";

const note = (hash: string, deck: string | null = "Продажи", rawText = "text") => ({ hash, deck, rawText });

describe("buildStagedNotes", () => {
  it("should skip notes with empty text and list their hashes so image-only notes never reach prod", () => {
    const outcome = buildStagedNotes([note("aaaaaaaaaaaaaaaa"), note("bbbbbbbbbbbbbbbb", "Продажи", "  ")]);

    expect(outcome).toEqual({
      ok: true,
      rows: [{ noteKey: "anki:aaaaaaaaaaaaaaaa", deck: "Продажи", rawText: "text", position: 0 }],
      skippedEmptyHashes: ["bbbbbbbbbbbbbbbb"],
    });
  });

  it("should refuse the whole file when a note has no deck", () => {
    expect(buildStagedNotes([note("aaaaaaaaaaaaaaaa"), note("bbbbbbbbbbbbbbbb", null)])).toEqual({
      ok: false,
      error: "unmapped_deck",
      hashes: ["bbbbbbbbbbbbbbbb"],
    });
  });

  it("should refuse the whole file when a deck is not in the Business map", () => {
    expect(buildStagedNotes([note("aaaaaaaaaaaaaaaa", "Cooking")])).toMatchObject({
      ok: false,
      error: "unmapped_deck",
    });
  });

  it("should keep the original file position so a later larger run keeps the same order", () => {
    const outcome = buildStagedNotes([note("aaaaaaaaaaaaaaaa", "Продажи", ""), note("bbbbbbbbbbbbbbbb")]);

    expect(outcome).toMatchObject({ ok: true, rows: [{ position: 1 }] });
  });

  it("should refuse a note whose text is over the 20,000 character limit", () => {
    expect(buildStagedNotes([note("aaaaaaaaaaaaaaaa", "Продажи", "x".repeat(20001))])).toEqual({
      ok: false,
      error: "invalid_notes",
      hashes: ["aaaaaaaaaaaaaaaa"],
    });
  });

  it("should refuse a file over the note cap", () => {
    const notes = Array.from({ length: MAX_IMPORT_NOTES + 1 }, () => note("aaaaaaaaaaaaaaaa"));

    expect(buildStagedNotes(notes)).toEqual({ ok: false, error: "too_many_notes", count: MAX_IMPORT_NOTES + 1 });
  });

  it("should refuse a note flagged oversized by the parser even when its text looks fine", () => {
    expect(buildStagedNotes([{ ...note("aaaaaaaaaaaaaaaa"), oversized: true as const }])).toEqual({
      ok: false,
      error: "invalid_notes",
      hashes: ["aaaaaaaaaaaaaaaa"],
    });
  });
});
