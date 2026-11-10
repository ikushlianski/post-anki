import { describe, expect, it, vi } from "vitest";
import { IMPORT_BACKFILL_DEFAULT_LIMIT, parseImportBackfillArgs, settleRebuiltSource } from "./import-cloze-backfill.js";

describe("parseImportBackfillArgs", () => {
  it("should default to a dry run over at most 25 sources", () => {
    expect(parseImportBackfillArgs([])).toEqual({ apply: false, allowRemote: false, limit: IMPORT_BACKFILL_DEFAULT_LIMIT });
    expect(IMPORT_BACKFILL_DEFAULT_LIMIT).toBe(25);
  });

  it("should apply only when the apply flag is given", () => {
    expect(parseImportBackfillArgs(["--apply", "--allow-remote"])).toMatchObject({ apply: true, allowRemote: true });
  });

  it("should take a positive whole-number limit", () => {
    expect(parseImportBackfillArgs(["--limit", "3"]).limit).toBe(3);
  });

  it("should refuse a limit that is missing, zero, negative or fractional", () => {
    expect(() => parseImportBackfillArgs(["--limit"])).toThrow("--limit needs a positive whole number");
    expect(() => parseImportBackfillArgs(["--limit", "0"])).toThrow("--limit needs a positive whole number");
    expect(() => parseImportBackfillArgs(["--limit", "-2"])).toThrow("--limit needs a positive whole number");
    expect(() => parseImportBackfillArgs(["--limit", "2.5"])).toThrow("--limit needs a positive whole number");
  });
});

describe("settleRebuiltSource", () => {
  const claim = { sourceId: "ksrc_1", supersededIds: ["kb_old", "kb_rewritten"], supersededCount: 2 };

  it("should keep every card the claim retired when regeneration inserted no new card", async () => {
    const restore = vi.fn().mockResolvedValue(2);
    const settlement = await settleRebuiltSource(claim, { status: "detected", inserted: 0 }, restore);

    expect(restore).toHaveBeenCalledWith("ksrc_1", ["kb_old", "kb_rewritten"]);
    expect(settlement).toMatchObject({ kept: true, retired: 0 });
    expect(settlement.line).toContain("kept 2 old card(s) pending");
  });

  it("should keep the old cards when regeneration failed before writing anything", async () => {
    const restore = vi.fn().mockResolvedValue(2);
    const settlement = await settleRebuiltSource(
      claim,
      { status: "failed", inserted: 0, failureReason: "no_valid_items" },
      restore,
    );

    expect(restore).toHaveBeenCalled();
    expect(settlement).toMatchObject({ kept: true, retired: 0 });
    expect(settlement.line).toContain("reason=no_valid_items");
  });

  it("should retire the old cards and report the claim's database count when new cards were inserted", async () => {
    const restore = vi.fn();
    const settlement = await settleRebuiltSource(
      { ...claim, supersededCount: 1 },
      { status: "detected", inserted: 3 },
      restore,
    );

    expect(restore).not.toHaveBeenCalled();
    expect(settlement).toMatchObject({ kept: false, retired: 1 });
    expect(settlement.line).toContain("retired 1");
  });

  it("should not restore old cards next to new ones when a later chunk failed after some cards were inserted", async () => {
    const restore = vi.fn();
    const settlement = await settleRebuiltSource(claim, { status: "failed", inserted: 2, failureReason: "chunk_failed" }, restore);

    expect(restore).not.toHaveBeenCalled();
    expect(settlement.kept).toBe(false);
  });
});
