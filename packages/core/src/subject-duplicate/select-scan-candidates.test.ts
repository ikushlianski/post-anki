import { describe, expect, it } from "vitest";
import { selectSubjectsForScan } from "./select-scan-candidates";

describe("selectSubjectsForScan", () => {
  it("puts a subject with no cached hash in toEmbed", () => {
    const result = selectSubjectsForScan(
      [{ id: "sub_a", contentHash: "h1", cachedHash: null }],
      10,
    );

    expect(result.toEmbed).toEqual(["sub_a"]);
    expect(result.reused).toEqual([]);
  });

  it("puts a subject whose cached hash matches current content in reused, not toEmbed", () => {
    const result = selectSubjectsForScan(
      [{ id: "sub_a", contentHash: "h1", cachedHash: "h1" }],
      10,
    );

    expect(result.reused).toEqual(["sub_a"]);
    expect(result.toEmbed).toEqual([]);
  });

  it("puts a subject whose cached hash differs from current content in toEmbed", () => {
    const result = selectSubjectsForScan(
      [{ id: "sub_a", contentHash: "h2", cachedHash: "h1" }],
      10,
    );

    expect(result.toEmbed).toEqual(["sub_a"]);
  });

  it("caps toEmbed and reports capped=true when eligible subjects exceed the cap", () => {
    const subjects = Array.from({ length: 5 }, (_, i) => ({
      id: `sub_${i}`,
      contentHash: "h1",
      cachedHash: null,
    }));

    const result = selectSubjectsForScan(subjects, 3);

    expect(result.capped).toBe(true);
    expect(result.toEmbed).toHaveLength(3);
  });

  it("never truncates reused by the cap", () => {
    const reusedSubjects = Array.from({ length: 5 }, (_, i) => ({
      id: `reused_${i}`,
      contentHash: "h1",
      cachedHash: "h1",
    }));
    const toEmbedSubjects = Array.from({ length: 4 }, (_, i) => ({
      id: `embed_${i}`,
      contentHash: "h2",
      cachedHash: null,
    }));

    const result = selectSubjectsForScan([...reusedSubjects, ...toEmbedSubjects], 2);

    expect(result.reused).toHaveLength(5);
    expect(result.toEmbed).toHaveLength(2);
    expect(result.capped).toBe(true);
  });

  it("does not report capped when eligible subjects are within the cap", () => {
    const result = selectSubjectsForScan(
      [{ id: "sub_a", contentHash: "h1", cachedHash: null }],
      10,
    );

    expect(result.capped).toBe(false);
  });

  it("prioritizes never-yet-embedded subjects (cachedHash null) over stale ones within the cap", () => {
    const subjects = [
      { id: "stale_1", contentHash: "h2", cachedHash: "h1" },
      { id: "stale_2", contentHash: "h2", cachedHash: "h1" },
      { id: "never_1", contentHash: "h1", cachedHash: null },
      { id: "never_2", contentHash: "h1", cachedHash: null },
    ];

    const result = selectSubjectsForScan(subjects, 2);

    expect(result.toEmbed).toEqual(["never_1", "never_2"]);
    expect(result.capped).toBe(true);
  });
});
