import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));

const { ensureSubjectPath, parseSubjectPath } = await import("./subject-path.js");

function fakeStore(existing: Record<string, string> = {}) {
  const rows = new Map<string, string>(Object.entries(existing));
  let counter = 0;

  return {
    rows,
    ensureRoot: vi.fn(async (name: string) => {
      const key = name.toLowerCase();
      const found = rows.get(key);

      if (found) {
        return { id: found, created: false };
      }

      const id = `sub_${++counter}`;

      rows.set(key, id);

      return { id, created: true };
    }),
    findChildByName: vi.fn(async (parentId: string, name: string) => rows.get(`${parentId}/${name.toLowerCase()}`) ?? null),
    createChild: vi.fn(async (parentId: string, name: string) => {
      const id = `sub_${++counter}`;

      rows.set(`${parentId}/${name.toLowerCase()}`, id);

      return id;
    }),
  };
}

describe("parseSubjectPath", () => {
  it("should accept a two-level path, a lone root and trim stray spaces around segments", () => {
    expect(parseSubjectPath("Work/AIPeak")).toEqual({ segments: ["Work", "AIPeak"] });
    expect(parseSubjectPath("Work")).toEqual({ segments: ["Work"] });
    expect(parseSubjectPath("  Work /  AIPeak ")).toEqual({ segments: ["Work", "AIPeak"] });
  });

  it("should reject empty segments, a third level and an over-long segment", () => {
    for (const bad of ["Work//X", "/Work", "Work/", " / ", "A/B/C", `${"x".repeat(61)}/B`]) {
      expect(parseSubjectPath(bad)).toEqual({ error: "invalid_path" });
    }
  });
});

describe("ensureSubjectPath", () => {
  it("should create the root and the child when neither exists, and list both as created", async () => {
    const store = fakeStore();
    const result = await ensureSubjectPath(["Work", "AIPeak"], store);

    expect(result).toEqual({
      subjectId: "sub_2",
      subjectName: "AIPeak",
      subjectPath: "Work/AIPeak",
      createdSubjects: ["Work", "Work/AIPeak"],
    });
  });

  it("should reuse an existing work root when asked for Work/AIPeak, creating only the child", async () => {
    const store = fakeStore({ work: "sub_root" });
    const result = await ensureSubjectPath(["Work", "AIPeak"], store);

    expect(result.createdSubjects).toEqual(["Work/AIPeak"]);
    expect(store.createChild).toHaveBeenCalledWith("sub_root", "AIPeak");
  });

  it("should create nothing when the full path already exists", async () => {
    const store = fakeStore({ work: "sub_root", "sub_root/aipeak": "sub_child" });
    const result = await ensureSubjectPath(["Work", "AIPeak"], store);

    expect(result).toMatchObject({ subjectId: "sub_child", createdSubjects: [] });
    expect(store.createChild).not.toHaveBeenCalled();
  });
});
