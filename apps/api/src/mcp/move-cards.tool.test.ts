import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("./subject-ref.js", () => ({ findExistingSubject: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-move.repo.js", () => ({ moveKnowledgeBitsBulk: vi.fn() }));

const { findExistingSubject } = await import("./subject-ref.js");
const { moveKnowledgeBitsBulk } = await import("../knowledge-bit/knowledge-bit-move.repo.js");
const { moveCards } = await import("./move-cards.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

const auth = { scopes: ["cards:write"] };

describe("moveCards", () => {
  it("should refuse without cards:write and move nothing", async () => {
    expect(await moveCards({ cardIds: ["kb1"], subject: "A" }, { scopes: [] })).toEqual({ error: "missing_scope" });
    expect(moveKnowledgeBitsBulk).not.toHaveBeenCalled();
  });

  it("should not create a missing target subject", async () => {
    vi.mocked(findExistingSubject).mockResolvedValue({ error: "not_found" });

    expect(await moveCards({ cardIds: ["kb1"], subject: "A/B" }, auth)).toEqual({ error: "subject_not_found" });
    expect(moveKnowledgeBitsBulk).not.toHaveBeenCalled();
  });

  it("should move cards and report the ones skipped", async () => {
    vi.mocked(findExistingSubject).mockResolvedValue({ subjectId: "s1", subjectPath: "A/B" });
    vi.mocked(moveKnowledgeBitsBulk).mockResolvedValue({ moved: ["kb1"], skipped: [{ id: "kb2", reason: "not_found" }] });

    expect(await moveCards({ cardIds: ["kb1", "kb2"], subject: "A/B" }, auth)).toEqual({
      subjectId: "s1",
      subjectPath: "A/B",
      moved: ["kb1"],
      skipped: [{ id: "kb2", reason: "not_found" }],
    });
    expect(moveKnowledgeBitsBulk).toHaveBeenCalledWith(["kb1", "kb2"], "s1");
  });
});
