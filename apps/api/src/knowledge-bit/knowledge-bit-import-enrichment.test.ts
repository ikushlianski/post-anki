import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonDraft } from "./knowledge-bit-source-item-validation.js";

const webSearch = vi.hoisted(() => vi.fn());

vi.mock("../probe/probe-grounding.js", () => ({
  webSearch: (...args: unknown[]) => webSearch(...args),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const {
  cutExampleText,
  enrichImportedItems,
  importEnrichBudget,
  IMPORT_ENRICH_MAX_CHUNKS,
  IMPORT_ENRICH_SEARCHES_PER_CHUNK,
} = await import("./knowledge-bit-import-enrichment.js");

const SOURCE_URL = "https://example.com/deal-qualification";

function draft(statement: string, example: string | null = null): LessonDraft {
  return {
    statement,
    quote: statement,
    example,
    cards: [{ kind: "basic", question: `What does ${statement}?`, answer: "x", statement, quote: statement }],
  };
}

describe("importEnrichBudget", () => {
  it("should allow searches only for Anki imports in the first chunks", () => {
    expect(importEnrichBudget(true, 0)).toBe(IMPORT_ENRICH_SEARCHES_PER_CHUNK);
    expect(importEnrichBudget(true, IMPORT_ENRICH_MAX_CHUNKS - 1)).toBe(IMPORT_ENRICH_SEARCHES_PER_CHUNK);
  });

  it("should allow no searches for a non-import source or a later chunk", () => {
    expect(importEnrichBudget(false, 0)).toBe(0);
    expect(importEnrichBudget(undefined, 0)).toBe(0);
    expect(importEnrichBudget(true, IMPORT_ENRICH_MAX_CHUNKS)).toBe(0);
  });
});

describe("cutExampleText", () => {
  it("should keep a short example whole", () => {
    expect(cutExampleText("  Short extra.  ")).toBe("Short extra.");
  });

  it("should end a long example at the last full sentence within the limit", () => {
    const text = `${"a".repeat(60)} one. ${"b".repeat(60)} two. ${"c".repeat(80)} three.`;
    const cut = cutExampleText(text);

    expect(cut.endsWith("two.")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(200);
  });

  it("should cut at exactly 200 characters when the text has no whitespace", () => {
    expect(cutExampleText("x".repeat(500))).toHaveLength(200);
  });

  it("should not cut inside a decimal number", () => {
    const cut = cutExampleText(`${"a".repeat(130)} 3.14${"b".repeat(100)}`);

    expect(cut).toBe("a".repeat(130));
  });
});

describe("enrichImportedItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    webSearch.mockResolvedValue({
      ok: true,
      text: "A regional bank qualified deals by asking who signs the contract.",
      citations: [SOURCE_URL],
    });
  });

  it("should fill the example and its source link for a draft that has none", async () => {
    const [enriched] = await enrichImportedItems([draft("Deals need an economic buyer.")], 2);

    expect(enriched).toMatchObject({
      example: "A regional bank qualified deals by asking who signs the contract.",
      webSources: [SOURCE_URL],
    });
  });

  it("should skip a draft that already has an example without spending a search", async () => {
    const items = [draft("Deals need an economic buyer.", "Already here.")];

    expect(await enrichImportedItems(items, 2)).toEqual(items);
    expect(webSearch).not.toHaveBeenCalled();
  });

  it("should never search more often than the budget for the chunk", async () => {
    const items = [draft("First claim."), draft("Second claim."), draft("Third claim.")];

    await enrichImportedItems(items, IMPORT_ENRICH_SEARCHES_PER_CHUNK);

    expect(webSearch).toHaveBeenCalledTimes(IMPORT_ENRICH_SEARCHES_PER_CHUNK);
  });

  it("should leave the draft unchanged when the search fails", async () => {
    webSearch.mockResolvedValue({ ok: false, status: 500 });
    const items = [draft("Deals need an economic buyer.")];

    expect(await enrichImportedItems(items, 2)).toEqual(items);
  });

  it("should leave the draft unchanged when the search throws", async () => {
    webSearch.mockRejectedValue(new Error("network down"));
    const items = [draft("Deals need an economic buyer.")];

    expect(await enrichImportedItems(items, 2)).toEqual(items);
  });

  it("should drop an example that carries injected markup the statement did not have", async () => {
    webSearch.mockResolvedValue({
      ok: true,
      text: "See <script>alert(1)</script> for details.",
      citations: [SOURCE_URL],
    });
    const items = [draft("Deals need an economic buyer.")];

    expect(await enrichImportedItems(items, 2)).toEqual(items);
  });

  it("should keep only safe source links", async () => {
    webSearch.mockResolvedValue({
      ok: true,
      text: "A short real example.",
      citations: ["javascript:alert(1)", SOURCE_URL],
    });
    const [enriched] = await enrichImportedItems([draft("Deals need an economic buyer.")], 2);

    expect(enriched?.webSources).toEqual([SOURCE_URL]);
  });
});
