import { describe, expect, it } from "vitest";
import {
  describeKnowledgeSourceRefusal,
  encodeKnowledgeSourceRefusal,
  knowledgeSourceDuplicatesFromError,
  knowledgeSourceRefusalFromError,
} from "./knowledge-source-refusal";

describe("knowledge source refusal", () => {
  it("should give each known server code its plain sentence", () => {
    expect(describeKnowledgeSourceRefusal("fetch_failed")).toBe("That page could not be opened.");
    expect(describeKnowledgeSourceRefusal("empty_content")).toBe("That page has no readable text.");
    expect(describeKnowledgeSourceRefusal("text_too_long")).toContain("longer than 50,000 characters");
  });

  it("should carry a known code across the server-function boundary as an error message", () => {
    const sent = encodeKnowledgeSourceRefusal(Object.assign(new Error("api"), { code: "empty_content" }));

    expect(knowledgeSourceRefusalFromError(sent)).toBe("empty_content");
  });

  it("should leave unknown failures untouched so the generic message shows", () => {
    const error = Object.assign(new Error("api"), { code: "invalid_input" });

    expect(encodeKnowledgeSourceRefusal(error)).toBe(error);
    expect(knowledgeSourceRefusalFromError(error)).toBeNull();
    expect(knowledgeSourceRefusalFromError(new Error("boom"))).toBeNull();
  });

  it("should carry the earlier source's id and date across the boundary for an already-added refusal", () => {
    const duplicates = [{ index: 1, existingId: "ks_old", addedAt: "2026-01-02T00:00:00.000Z" }];
    const sent = encodeKnowledgeSourceRefusal(
      Object.assign(new Error("api"), { code: "already_added", details: { duplicates } }),
    );

    expect(knowledgeSourceRefusalFromError(sent)).toBe("already_added");
    expect(knowledgeSourceDuplicatesFromError(sent)).toEqual(duplicates);
    expect(describeKnowledgeSourceRefusal("already_added")).toBe("This was already added.");
  });

  it("should report no earlier sources for a refusal that is not already_added", () => {
    expect(knowledgeSourceDuplicatesFromError(new Error("boom"))).toEqual([]);
  });
});
