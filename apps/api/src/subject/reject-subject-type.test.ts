import { describe, expect, it } from "vitest";
import { pickRejectSubjectType } from "./reject-subject-type.js";

function row(id: string, name: string, parentId: string | null, kind = "architecture-mentor") {
  return { id, name, parentId, kind };
}

describe("pickRejectSubjectType", () => {
  it("should treat a topic under a programming language as programming", () => {
    const rows = [row("t", "TypeScript", null), row("g", "Generics", "t")];

    expect(pickRejectSubjectType("g", rows)).toBe("programming");
  });

  it("should keep language and business subjects on their own lists", () => {
    const rows = [row("e", "English", null), row("b", "Business", null), row("s", "Sales", "b")];

    expect(pickRejectSubjectType("e", rows)).toBe("language");
    expect(pickRejectSubjectType("s", rows)).toBe("business");
  });

  it("should fall back to other for unrelated or missing subjects", () => {
    const rows = [row("c", "Cooking", null)];

    expect(pickRejectSubjectType("c", rows)).toBe("other");
    expect(pickRejectSubjectType(null, rows)).toBe("other");
  });
});
