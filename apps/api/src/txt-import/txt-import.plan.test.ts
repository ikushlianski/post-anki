import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_TXT_FILE_CHARS, planTxtImport } from "./txt-import.plan.js";

const ankiExport = readFileSync(
  new URL("../../../anki-batch-mcp/src/test-fixtures/small-export.txt", import.meta.url),
  "utf8",
);

describe("planTxtImport", () => {
  it("should stage an Anki export under an id derived from its content so a re-upload hits the same notes", () => {
    const first = planTxtImport(ankiExport);
    const second = planTxtImport(ankiExport);

    expect(first.kind).toBe("anki");

    if (first.kind !== "anki" || second.kind !== "anki") return;

    expect(first.rows.length).toBeGreaterThan(0);
    expect(second.importId).toBe(first.importId);
    expect(first.importId).toMatch(/^[a-z0-9-]{3,40}$/);
  });

  it("should turn any other text file into one source with a stable dedupe key", () => {
    const plan = planTxtImport("  Some plain notes about pricing.\n");
    const again = planTxtImport("Some plain notes about pricing.");

    expect(plan).toMatchObject({ kind: "single", text: "Some plain notes about pricing." });
    expect(again).toEqual(plan);
  });

  it("should refuse an empty file", () => {
    expect(planTxtImport("  \n ")).toEqual({ kind: "refused", reason: "empty_file" });
  });

  it("should refuse binary content", () => {
    expect(planTxtImport("PK\u0000\u0003binary")).toEqual({ kind: "refused", reason: "not_text" });
  });

  it("should refuse a file over the upload limit", () => {
    expect(planTxtImport("a".repeat(MAX_TXT_FILE_CHARS + 1))).toEqual({ kind: "refused", reason: "file_too_large" });
  });

  it("should refuse a plain text too long for one source", () => {
    expect(planTxtImport("a".repeat(60_000))).toEqual({ kind: "refused", reason: "text_too_long" });
  });

  it("should refuse an Anki export whose decks are unknown", () => {
    const text = '#separator:tab\n"<div class=""subdeck-label"">Cooking::Pasta</div>\n\nBoil"\t"back"\n';

    expect(planTxtImport(text)).toMatchObject({ kind: "refused", reason: "unmapped_deck" });
  });
});
