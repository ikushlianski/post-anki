import { describe, expect, it } from "vitest";
import type { KnowledgeSourceAttention, PendingKnowledgeSourceForReview } from "@post-anki/shared";
import { mergeAttentionIntoSources } from "./knowledge-source-attention.merge.js";

const notice: KnowledgeSourceAttention = {
  knowledgeSourceId: "ksrc_1",
  kind: "failed",
  reason: "no_valid_items",
  firstWords: "Hello",
  sourceText: "Hello world",
  since: "2026-01-01T00:00:00.000Z",
};

const source: PendingKnowledgeSourceForReview = {
  knowledgeSourceId: "ksrc_2",
  sourceText: "Other",
  subjectName: null,
  bits: [],
};

describe("mergeAttentionIntoSources", () => {
  it("should list a failed note with no cards ahead of the normal groups", () => {
    const merged = mergeAttentionIntoSources([source], [notice]);

    expect(merged.map((entry) => entry.knowledgeSourceId)).toEqual(["ksrc_1", "ksrc_2"]);
    expect(merged[0]?.bits).toEqual([]);
    expect(merged[0]?.attention).toEqual(notice);
    expect(merged[1]?.attention).toBeUndefined();
  });

  it("should attach the notice to the note's existing group instead of duplicating it", () => {
    const merged = mergeAttentionIntoSources([{ ...source, knowledgeSourceId: "ksrc_1" }], [notice]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.attention).toEqual(notice);
  });

  it("should return the list unchanged when nothing needs attention", () => {
    expect(mergeAttentionIntoSources([source], [])).toEqual([source]);
  });
});
