import { describe, expect, it } from "vitest";
import { noteSearchFiltersSchema, NOTE_SEARCH_DEFAULT_LIMIT, NOTE_SEARCH_MAX_LIMIT } from "./note";
import { listOpenQuestionsQuerySchema } from "./open-questions";

describe("note search limits", () => {
  it("should default to 200 results when a client sends no limit", () => {
    expect(noteSearchFiltersSchema.parse({}).limit).toBe(NOTE_SEARCH_DEFAULT_LIMIT);
    expect(NOTE_SEARCH_DEFAULT_LIMIT).toBe(200);
  });

  it("should refuse a limit above the maximum", () => {
    expect(noteSearchFiltersSchema.safeParse({ limit: NOTE_SEARCH_MAX_LIMIT }).success).toBe(true);
    expect(noteSearchFiltersSchema.safeParse({ limit: NOTE_SEARCH_MAX_LIMIT + 1 }).success).toBe(
      false,
    );
  });
});

describe("open questions list limit", () => {
  it("should accept 1000 and refuse 1001", () => {
    expect(listOpenQuestionsQuerySchema.safeParse({ limit: "1000" }).success).toBe(true);
    expect(listOpenQuestionsQuerySchema.safeParse({ limit: "1001" }).success).toBe(false);
  });
});
