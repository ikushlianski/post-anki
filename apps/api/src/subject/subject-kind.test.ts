import { describe, expect, it } from "vitest";
import { pickSubjectKind } from "./subject-kind.js";

function row(id: string, name: string, parentId: string | null, kind = "architecture-mentor") {
  return { id, name, parentId, kind };
}

describe("pickSubjectKind", () => {
  it("should treat the Business root and everything below it as business", () => {
    const rows = [row("b", "Business", null), row("s", "Sales", "b"), row("c", "Cold sales", "s")];

    expect(pickSubjectKind("b", rows)).toBe("business");
    expect(pickSubjectKind("s", rows)).toBe("business");
    expect(pickSubjectKind("c", rows)).toBe("business");
  });

  it("should treat a language root by name, in any case, and its children as language", () => {
    const rows = [row("e", "English", null), row("p", "polish", null), row("g", "Grammar", "p")];

    expect(pickSubjectKind("e", rows)).toBe("language");
    expect(pickSubjectKind("g", rows)).toBe("language");
  });

  it("should treat any ancestor with the language-practice kind as language", () => {
    const rows = [row("r", "Anything", null), row("l", "Lessons", "r", "language-practice"), row("c", "Deep", "l")];

    expect(pickSubjectKind("c", rows)).toBe("language");
  });

  it("should leave unrelated subjects as other", () => {
    const rows = [row("m", "Music", null), row("i", "Investing", null), row("p", "Phase5Test", null)];

    expect(rows.map((r) => pickSubjectKind(r.id, rows))).toEqual(["other", "other", "other"]);
  });

  it("should fall back to other for a missing or null subject", () => {
    expect(pickSubjectKind(null, [])).toBe("other");
    expect(pickSubjectKind("missing", [row("m", "Music", null)])).toBe("other");
  });

  it("should stop on a parent cycle", () => {
    const rows = [row("a", "A", "b"), row("b", "B", "a")];

    expect(pickSubjectKind("a", rows)).toBe("other");
  });

  it("should prefer language over business when both appear above the subject", () => {
    const rows = [row("b", "Business", null), row("l", "English", "b"), row("c", "Idioms", "l", "language-practice")];

    expect(pickSubjectKind("c", rows)).toBe("language");
    expect(pickSubjectKind("l", rows)).toBe("business");
  });
});
