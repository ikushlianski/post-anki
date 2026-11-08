import { describe, expect, it } from "vitest";
import { hasScope, parseScopeList } from "./api-token.scopes.js";

describe("hasScope", () => {
  it("should grant every scope to a credential carrying the wildcard", () => {
    expect(hasScope(["*"], "knowledge:write")).toBe(true);
  });

  it("should grant a scope the token lists exactly", () => {
    expect(hasScope(["knowledge:write"], "knowledge:write")).toBe(true);
  });

  it("should refuse a token minted without scopes", () => {
    expect(hasScope([], "knowledge:write")).toBe(false);
  });
});

describe("parseScopeList", () => {
  it("should accept a comma-separated list with spaces around the names", () => {
    expect(parseScopeList(" knowledge:write , ")).toEqual(["knowledge:write"]);
  });

  it("should refuse a scope name the API does not know", () => {
    expect(() => parseScopeList("cards:delete")).toThrow();
  });
});
