import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import type { Tag } from "@post-anki/shared";
import { TAG_TAXONOMY_CAP } from "@post-anki/core";
import { assignTagForAutoTag, type TagAutoAssignDeps } from "./tag-auto-assign.js";

function tag(id: string, name: string): Tag {
  return { id, name, normalizedName: name.toLowerCase() };
}

function buildDeps(overrides: Partial<TagAutoAssignDeps>): TagAutoAssignDeps {
  return {
    listTags: vi.fn().mockResolvedValue([]),
    resolveTagUnderCapGuard: vi
      .fn()
      .mockImplementation(async (candidateName: string) => tag("new", candidateName)),
    matchClosestTag: vi.fn().mockResolvedValue({ matchedTagName: null }),
    ...overrides,
  };
}

describe("assignTagForAutoTag", () => {
  it("reuses an exact normalized-name match with no LLM call", async () => {
    const deps = buildDeps({ listTags: vi.fn().mockResolvedValue([tag("t1", "sales")]) });

    const result = await assignTagForAutoTag("Sales", undefined, deps);

    expect(result).toEqual(tag("t1", "sales"));
    expect(deps.matchClosestTag).not.toHaveBeenCalled();
    expect(deps.resolveTagUnderCapGuard).not.toHaveBeenCalled();
  });

  it("hands the candidate and the LLM's matched name to the cap guard while under the cap", async () => {
    const deps = buildDeps({
      listTags: vi.fn().mockResolvedValue([tag("t1", "pricing")]),
      matchClosestTag: vi.fn().mockResolvedValue({ matchedTagName: "pricing" }),
    });

    const result = await assignTagForAutoTag("price strategy", undefined, deps);

    expect(deps.resolveTagUnderCapGuard).toHaveBeenCalledWith("price strategy", "pricing");
    expect(result.name).toBe("price strategy");
  });

  it("asks matchClosestTag with forceMatch once the taxonomy is at the cap", async () => {
    const existing = Array.from({ length: TAG_TAXONOMY_CAP }, (_, i) => tag(`t${i}`, `tag${i}`));
    const deps = buildDeps({
      listTags: vi.fn().mockResolvedValue(existing),
      matchClosestTag: vi.fn().mockResolvedValue({ matchedTagName: "tag0" }),
    });

    await assignTagForAutoTag("a brand new concept", undefined, deps);

    expect(deps.matchClosestTag).toHaveBeenCalledWith(
      "a brand new concept",
      undefined,
      existing.map((t) => t.name),
      true,
    );
    expect(deps.resolveTagUnderCapGuard).toHaveBeenCalledWith(
      "a brand new concept",
      "tag0",
    );
  });

  it("never trusts the pre-lock listTags snapshot for the cap decision itself", async () => {
    const deps = buildDeps({ listTags: vi.fn().mockResolvedValue([]) });

    await assignTagForAutoTag("concept", undefined, deps);

    expect(deps.resolveTagUnderCapGuard).toHaveBeenCalledTimes(1);
  });
});

describe("resolveTagUnderCapGuard's contract with an untrusted matched name", () => {
  it("is the single place assignTagForAutoTag defers the cap invariant to", async () => {
    const guard = vi.fn().mockResolvedValue(tag("t0", "tag0"));
    const deps = buildDeps({
      listTags: vi.fn().mockResolvedValue([tag("t0", "tag0")]),
      matchClosestTag: vi.fn().mockResolvedValue({ matchedTagName: "a hallucinated name" }),
      resolveTagUnderCapGuard: guard,
    });

    const result = await assignTagForAutoTag("new concept", undefined, deps);

    expect(guard).toHaveBeenCalledWith("new concept", "a hallucinated name");
    expect(result).toEqual(tag("t0", "tag0"));
  });
});
