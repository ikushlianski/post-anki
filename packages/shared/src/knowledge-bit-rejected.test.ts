import { describe, expect, it } from "vitest";
import { rejectedCardsPageSchema, rejectedCardsQuerySchema } from "./knowledge-bit-rejected";

describe("rejectedCardsQuerySchema", () => {
  it("should default to the first page of all reasons", () => {
    expect(rejectedCardsQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it("should accept legacy and unspecified reasons so old rejections stay filterable", () => {
    expect(rejectedCardsQuerySchema.parse({ reason: "bad_format" }).reason).toBe("bad_format");
    expect(rejectedCardsQuerySchema.parse({ reason: "unspecified" }).reason).toBe("unspecified");
  });

  it("should reject an unknown reason instead of silently showing everything", () => {
    expect(rejectedCardsQuerySchema.safeParse({ reason: "nope" }).success).toBe(false);
  });
});

describe("rejectedCardsPageSchema", () => {
  it("should still decode a page from an older server that sends no reason counts", () => {
    const page = rejectedCardsPageSchema.parse({ items: [], hasMore: false });

    expect(page.reasonCounts).toBeUndefined();
  });

  it("should carry per-reason counts when the server sends them", () => {
    const page = rejectedCardsPageSchema.parse({ items: [], hasMore: false, reasonCounts: { other: 3 } });

    expect(page.reasonCounts).toEqual({ other: 3 });
  });
});
