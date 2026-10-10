import { describe, expect, it } from "vitest";
import fixture from "./fixtures/openrouter-models.fixture.json";
import {
  DEFAULT_LIST_OPTIONS,
  formatModelTable,
  parseListOptions,
  parseModels,
  selectModels,
} from "./openrouter-models-core";

const APP_CHEAP_MODEL_ID = "openrouter/deepseek/deepseek-v4-flash-latest";

describe("parseModels", () => {
  it("should keep well-formed entries and skip malformed or unpriced ones", () => {
    const ids = parseModels(fixture).map((row) => row.id);

    expect(ids).toEqual([
      "deepseek/deepseek-v4-flash",
      "openai/gpt-4o-mini",
      "meta-llama/llama-3.1-8b-instruct",
      "vendor/free-structured-model",
      "vendor/premium-structured",
    ]);
  });

  it("should convert per-token USD prices into per-million values", () => {
    const flash = parseModels(fixture).find((row) => row.id === "deepseek/deepseek-v4-flash");

    expect(flash?.inputPerMillion).toBeCloseTo(0.14);
    expect(flash?.outputPerMillion).toBeCloseTo(0.28);
  });

  it("should render unix created timestamps as ISO dates", () => {
    const flash = parseModels(fixture).find((row) => row.id === "deepseek/deepseek-v4-flash");

    expect(flash?.createdAt).toBe("2026-01-01");
  });

  it("should reject a payload without a data array", () => {
    expect(() => parseModels({ models: [] })).toThrow();
  });
});

describe("selectModels", () => {
  it("should keep only structured-output models by default", () => {
    const ids = selectModels(parseModels(fixture), DEFAULT_LIST_OPTIONS).map((row) => row.id);

    expect(ids).not.toContain("meta-llama/llama-3.1-8b-instruct");
    expect(ids).toContain("openai/gpt-4o-mini");
  });

  it("should include non-structured models when structured filtering is off", () => {
    const ids = selectModels(parseModels(fixture), { ...DEFAULT_LIST_OPTIONS, structuredOnly: false }).map(
      (row) => row.id,
    );

    expect(ids).toContain("meta-llama/llama-3.1-8b-instruct");
  });

  it("should rank by input plus 0.3 times output when sorting by blend", () => {
    const ids = selectModels(parseModels(fixture), DEFAULT_LIST_OPTIONS).map((row) => row.id);

    expect(ids).toEqual([
      "vendor/free-structured-model",
      "deepseek/deepseek-v4-flash",
      "openai/gpt-4o-mini",
      "vendor/premium-structured",
    ]);
  });

  it("should rank by output price when sorting by output", () => {
    const ids = selectModels(parseModels(fixture), { ...DEFAULT_LIST_OPTIONS, sort: "output" }).map((row) => row.id);

    expect(ids).toEqual([
      "vendor/free-structured-model",
      "deepseek/deepseek-v4-flash",
      "openai/gpt-4o-mini",
      "vendor/premium-structured",
    ]);
  });

  it("should rank by input price when sorting by input", () => {
    const ids = selectModels(parseModels(fixture), { ...DEFAULT_LIST_OPTIONS, sort: "input" }).map((row) => row.id);

    expect(ids).toEqual([
      "vendor/free-structured-model",
      "deepseek/deepseek-v4-flash",
      "openai/gpt-4o-mini",
      "vendor/premium-structured",
    ]);
  });

  it("should cap the result at the requested limit", () => {
    const ids = selectModels(parseModels(fixture), { ...DEFAULT_LIST_OPTIONS, limit: 2 }).map((row) => row.id);

    expect(ids).toEqual(["vendor/free-structured-model", "deepseek/deepseek-v4-flash"]);
  });

  it("should match the search text case-insensitively against id or name", () => {
    const ids = selectModels(parseModels(fixture), { ...DEFAULT_LIST_OPTIONS, search: "GPT-4O" }).map(
      (row) => row.id,
    );

    expect(ids).toEqual(["openai/gpt-4o-mini"]);
  });
});

describe("formatModelTable", () => {
  it("should mark the app's current cheap model with an arrow", () => {
    const rows = selectModels(parseModels(fixture), DEFAULT_LIST_OPTIONS);
    const lines = formatModelTable(rows, APP_CHEAP_MODEL_ID).split("\n");

    const markedLines = lines.filter((line) => line.startsWith("->"));
    expect(markedLines).toHaveLength(1);
    expect(markedLines[0]).toContain("deepseek/deepseek-v4-flash");
  });

  it("should show prices per million tokens with three decimals", () => {
    const rows = selectModels(parseModels(fixture), DEFAULT_LIST_OPTIONS);
    const output = formatModelTable(rows, APP_CHEAP_MODEL_ID);

    expect(output).toContain("0.140");
    expect(output).toContain("0.280");
  });

  it("should show a dash where the knowledge cutoff is missing", () => {
    const rows = selectModels(parseModels(fixture), { ...DEFAULT_LIST_OPTIONS, search: "gpt-4o-mini" });
    const line = formatModelTable(rows, APP_CHEAP_MODEL_ID).split("\n")[1];

    expect(line).toMatch(/\s-\s+2026-12-01$/);
  });
});

describe("parseListOptions", () => {
  it("should use structured-only, 20 rows, blend sort and no search when no flags are given", () => {
    expect(parseListOptions([])).toEqual({ structuredOnly: true, limit: 20, sort: "blend", search: null });
  });

  it("should accept space-separated and equals-separated flag values", () => {
    expect(parseListOptions(["--limit", "5", "--sort=input", "--search=llama"])).toEqual({
      structuredOnly: true,
      limit: 5,
      sort: "input",
      search: "llama",
    });
  });

  it("should turn off structured filtering with --no-structured", () => {
    expect(parseListOptions(["--no-structured"]).structuredOnly).toBe(false);
  });

  it("should reject a sort key outside output, input and blend", () => {
    expect(() => parseListOptions(["--sort", "price"])).toThrow("--sort must be one of");
  });

  it("should reject a non-positive or non-integer limit", () => {
    expect(() => parseListOptions(["--limit", "0"])).toThrow("--limit must be a positive integer");
    expect(() => parseListOptions(["--limit", "2.5"])).toThrow("--limit must be a positive integer");
  });

  it("should reject unknown arguments", () => {
    expect(() => parseListOptions(["--verbose"])).toThrow("Unknown argument: --verbose");
  });
});
