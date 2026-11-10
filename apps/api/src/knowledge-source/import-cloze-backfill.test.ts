import { describe, expect, it } from "vitest";
import { IMPORT_BACKFILL_DEFAULT_LIMIT, parseImportBackfillArgs } from "./import-cloze-backfill.js";

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
