import { describe, it, expect } from "vitest";
import { resolveDomainNodeSource } from "./resolve-domain-node-source";

// SCENARIO 1/8 — resolveDomainNodeSource() decides which of the two
// placement paths a subject uses: the new on-demand AI-mapping flow
// (static_taxonomy) or today's unchanged resolveDomainPlacement flow
// (dynamic/empty).

describe("resolveDomainNodeSource", () => {
  it("returns static_taxonomy when any node carries that source", () => {
    const result = resolveDomainNodeSource([
      { source: "ai_generated" },
      { source: "static_taxonomy" },
    ]);

    expect(result).toBe("static_taxonomy");
  });

  it("returns empty for a subject with no domain nodes at all", () => {
    expect(resolveDomainNodeSource([])).toBe("empty");
  });

  it("returns dynamic for a subject whose nodes are all ai_generated (today's every subject)", () => {
    const result = resolveDomainNodeSource([
      { source: "ai_generated" },
      { source: "ai_generated" },
    ]);

    expect(result).toBe("dynamic");
  });
});
