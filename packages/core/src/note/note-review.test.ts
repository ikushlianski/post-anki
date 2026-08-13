import { describe, it, expect } from "vitest";
import { selectNoteForReview } from "./note-review";

const NOW = "2026-08-08T00:00:00.000Z";

describe("selectNoteForReview", () => {
  it("returns null for an empty candidate pool", () => {
    expect(selectNoteForReview([], NOW)).toBeNull();
  });

  it("always picks a never-surfaced note over a surfaced one", () => {
    const candidates = [
      { id: "surfaced", lastSurfacedAt: "2020-01-01T00:00:00.000Z", createdAt: "2019-01-01T00:00:00.000Z" },
      { id: "never", lastSurfacedAt: null, createdAt: "2026-01-01T00:00:00.000Z" },
    ];

    expect(selectNoteForReview(candidates, NOW)).toBe("never");
  });

  it("among surfaced notes, picks strictly the oldest lastSurfacedAt", () => {
    const candidates = [
      { id: "recent", lastSurfacedAt: "2026-01-01T00:00:00.000Z", createdAt: "2020-01-01T00:00:00.000Z" },
      { id: "oldest", lastSurfacedAt: "2020-01-01T00:00:00.000Z", createdAt: "2020-01-01T00:00:00.000Z" },
      { id: "middle", lastSurfacedAt: "2023-01-01T00:00:00.000Z", createdAt: "2020-01-01T00:00:00.000Z" },
    ];

    expect(selectNoteForReview(candidates, NOW)).toBe("oldest");
  });

  it("ties among surfaced notes break on oldest createdAt", () => {
    const candidates = [
      { id: "newer", lastSurfacedAt: "2020-01-01T00:00:00.000Z", createdAt: "2021-01-01T00:00:00.000Z" },
      { id: "older", lastSurfacedAt: "2020-01-01T00:00:00.000Z", createdAt: "2019-01-01T00:00:00.000Z" },
    ];

    expect(selectNoteForReview(candidates, NOW)).toBe("older");
  });

  it("ties among never-surfaced notes break on oldest createdAt", () => {
    const candidates = [
      { id: "newer", lastSurfacedAt: null, createdAt: "2021-01-01T00:00:00.000Z" },
      { id: "older", lastSurfacedAt: null, createdAt: "2019-01-01T00:00:00.000Z" },
    ];

    expect(selectNoteForReview(candidates, NOW)).toBe("older");
  });

  it("excludes ids passed via excludeIds", () => {
    const candidates = [
      { id: "a", lastSurfacedAt: null, createdAt: "2019-01-01T00:00:00.000Z" },
      { id: "b", lastSurfacedAt: null, createdAt: "2020-01-01T00:00:00.000Z" },
    ];

    expect(selectNoteForReview(candidates, NOW, ["a"])).toBe("b");
  });

  it("returns null when every candidate is excluded", () => {
    const candidates = [{ id: "a", lastSurfacedAt: null, createdAt: "2019-01-01T00:00:00.000Z" }];

    expect(selectNoteForReview(candidates, NOW, ["a"])).toBeNull();
  });

  it("is deterministic across repeated calls with the same inputs", () => {
    const candidates = [
      { id: "a", lastSurfacedAt: "2020-01-01T00:00:00.000Z", createdAt: "2019-01-01T00:00:00.000Z" },
      { id: "b", lastSurfacedAt: "2021-01-01T00:00:00.000Z", createdAt: "2018-01-01T00:00:00.000Z" },
    ];

    const first = selectNoteForReview(candidates, NOW);
    const second = selectNoteForReview(candidates, NOW);

    expect(first).toBe(second);
    expect(first).toBe("a");
  });
});
