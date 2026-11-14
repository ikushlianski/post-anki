import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../subject/subject.repo.js", () => ({ createSubject: vi.fn(), getSubject: vi.fn() }));
vi.mock("./subject-ref.js", () => ({ findExistingSubject: vi.fn() }));

const { createSubject } = await import("../subject/subject.repo.js");
const { findExistingSubject } = await import("./subject-ref.js");
const { addSubject } = await import("./add-subject.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

const auth = { scopes: ["knowledge:write"] };

describe("addSubject", () => {
  it("should refuse without knowledge:write", async () => {
    expect(await addSubject({ name: "Rust" }, { scopes: [] })).toEqual({ error: "missing_scope" });
    expect(createSubject).not.toHaveBeenCalled();
  });

  it("should create a top-level subject", async () => {
    vi.mocked(createSubject).mockResolvedValue({ id: "sub_1", name: "Rust" } as never);

    expect(await addSubject({ name: "Rust" }, auth)).toEqual({ subjectId: "sub_1", name: "Rust", parentId: null });
  });

  it("should create a sub-subject under an existing parent", async () => {
    vi.mocked(findExistingSubject).mockResolvedValue({ subjectId: "sub_p", subjectPath: "English" });
    vi.mocked(createSubject).mockResolvedValue({ id: "sub_2", name: "Words" } as never);

    const result = await addSubject({ name: "Words", parent: "English" }, auth);

    expect(createSubject).toHaveBeenCalledWith(expect.objectContaining({ name: "Words", parentId: "sub_p" }));
    expect(result).toEqual({ subjectId: "sub_2", name: "Words", parentId: "sub_p" });
  });

  it("should not create anything when the parent does not exist", async () => {
    vi.mocked(findExistingSubject).mockResolvedValue({ error: "not_found" });

    expect(await addSubject({ name: "Words", parent: "Nope" }, auth)).toEqual({ error: "parent_not_found" });
    expect(createSubject).not.toHaveBeenCalled();
  });
});
