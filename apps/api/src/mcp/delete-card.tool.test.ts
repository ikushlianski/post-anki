import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-approval.repo.js", () => ({ rejectKnowledgeBit: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-delete.repo.js", () => ({ deleteKnowledgeBitsBulk: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-read.repo.js", () => ({ getKnowledgeBitById: vi.fn() }));

const { rejectKnowledgeBit } = await import("../knowledge-bit/knowledge-bit-approval.repo.js");
const { deleteKnowledgeBitsBulk } = await import("../knowledge-bit/knowledge-bit-delete.repo.js");
const { getKnowledgeBitById } = await import("../knowledge-bit/knowledge-bit-read.repo.js");
const { deleteCard } = await import("./delete-card.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

const auth = { scopes: ["cards:write"] };

describe("deleteCard", () => {
  it("should refuse without cards:write and delete nothing", async () => {
    expect(await deleteCard({ cardId: "kb_1" }, { scopes: [] })).toEqual({ error: "missing_scope" });
    expect(getKnowledgeBitById).not.toHaveBeenCalled();
  });

  it("should permanently delete an approved card", async () => {
    vi.mocked(getKnowledgeBitById).mockResolvedValue({ approvalState: "approved" } as never);
    vi.mocked(deleteKnowledgeBitsBulk).mockResolvedValue({ deleted: ["kb_1"], skipped: [] });

    expect(await deleteCard({ cardId: "kb_1" }, auth)).toEqual({ cardId: "kb_1", outcome: "deleted" });
  });

  it("should discard a pending card instead of deleting it", async () => {
    vi.mocked(getKnowledgeBitById).mockResolvedValue({ approvalState: "pending" } as never);
    vi.mocked(rejectKnowledgeBit).mockResolvedValue({ ok: true, feedbackId: null });

    expect(await deleteCard({ cardId: "kb_1" }, auth)).toEqual({ cardId: "kb_1", outcome: "discarded" });
    expect(deleteKnowledgeBitsBulk).not.toHaveBeenCalled();
  });

  it("should report not_found for an unknown card", async () => {
    vi.mocked(getKnowledgeBitById).mockResolvedValue(null);

    expect(await deleteCard({ cardId: "nope" }, auth)).toEqual({ error: "not_found" });
  });
});
