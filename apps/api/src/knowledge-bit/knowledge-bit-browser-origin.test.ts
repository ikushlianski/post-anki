import { describe, expect, it } from "vitest";
import { deriveBrowserOrigin } from "./knowledge-bit-browser-origin.js";

const base = { origin: "extracted", isAiGenerated: false, sourceKind: "prose", sourceUrl: null } as const;

describe("deriveBrowserOrigin", () => {
  it("should say a typed-in piece was added by the user", () => {
    expect(deriveBrowserOrigin({ ...base, origin: "manual", isAiGenerated: true })).toBe("manual");
  });

  it("should say an AI web search piece came from AI web search", () => {
    expect(deriveBrowserOrigin({ ...base, isAiGenerated: true })).toBe("ai_web");
  });

  it("should say a piece from an imported article came from the article", () => {
    expect(deriveBrowserOrigin({ ...base, sourceUrl: "https://x.test/a" })).toBe("article");
  });

  it("should say a piece from a Notion source came from Notion", () => {
    expect(deriveBrowserOrigin({ ...base, sourceKind: "notion" })).toBe("notion");
  });

  it("should say a piece extracted from pasted text came from pasted text", () => {
    expect(deriveBrowserOrigin(base)).toBe("pasted");
  });
});
