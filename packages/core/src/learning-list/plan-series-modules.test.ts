import { describe, expect, it } from "vitest";
import { planSeriesModules } from "./plan-series-modules";

function chapters(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://github.com/owner/repo/blob/main/0${Math.floor(i / 4) + 1}-Part/Chapter_${i + 1}-Title.md`,
    title: `Chapter ${i + 1} — Title ${i + 1}`,
  }));
}

describe("planSeriesModules", () => {
  it("produces one correctly ordered, correctly named module per part for a twelve-part book", () => {
    const planned = planSeriesModules(chapters(12));

    expect(planned).toHaveLength(12);
    expect(planned.map((m) => m.order)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(planned.map((m) => m.title)).toEqual(
      Array.from({ length: 12 }, (_, i) => `Chapter ${i + 1} — Title ${i + 1}`),
    );
    expect(planned[0]!.url).toBe(chapters(12)[0]!.url);
  });

  it("preserves the input order rather than re-sorting", () => {
    const planned = planSeriesModules([
      { url: "https://x/z", title: "Z" },
      { url: "https://x/a", title: "A" },
    ]);

    expect(planned.map((m) => m.title)).toEqual(["Z", "A"]);
  });

  it("drops blank urls", () => {
    const planned = planSeriesModules([
      { url: "  ", title: "No url" },
      { url: "https://x/a", title: "A" },
    ]);

    expect(planned).toHaveLength(1);
    expect(planned[0]!.title).toBe("A");
  });

  it("keeps only the first occurrence of a duplicated url", () => {
    const planned = planSeriesModules([
      { url: "https://x/a", title: "First" },
      { url: "https://x/a", title: "Duplicate" },
    ]);

    expect(planned).toHaveLength(1);
    expect(planned[0]!.title).toBe("First");
  });

  it("falls back to an ordinal name when a part has no usable title", () => {
    const planned = planSeriesModules([
      { url: "https://x/a", title: "   " },
      { url: "https://x/b", title: "Real Title" },
    ]);

    expect(planned[0]!.title).toBe("Part 1");
    expect(planned[1]!.title).toBe("Real Title");
  });

  it("returns an empty array for no parts, leaving the legacy path to take over", () => {
    expect(planSeriesModules([])).toEqual([]);
  });
});
