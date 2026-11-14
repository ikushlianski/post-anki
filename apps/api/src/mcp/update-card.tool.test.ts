import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-approval-embedding.orchestrator.js", () => ({ embedApprovedKnowledgeBits: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-approval.repo.js", () => ({ editKnowledgeBitQuestionVariant: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-note-edit.repo.js", () => ({ editKnowledgeBitClozeNote: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-question-variant.repo.js", () => ({ listActiveVariantsForBit: vi.fn() }));

const { editKnowledgeBitQuestionVariant } = await import("../knowledge-bit/knowledge-bit-approval.repo.js");
const { listActiveVariantsForBit } = await import("../knowledge-bit/knowledge-bit-question-variant.repo.js");
const { embedApprovedKnowledgeBits } = await import("../knowledge-bit/knowledge-bit-approval-embedding.orchestrator.js");
const { updateCard } = await import("./update-card.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

const auth = { scopes: ["cards:write"] };
const basic = { id: "v1", kind: "basic", context: null, prompt: "Old Q", answer: "Old A" };

describe("updateCard", () => {
  it("should refuse without cards:write", async () => {
    expect(await updateCard({ cardId: "kb_1", front: "Q" }, { scopes: [] })).toEqual({ error: "missing_scope" });
  });

  it("should keep the current back when only the front changes and re-embed the card", async () => {
    vi.mocked(listActiveVariantsForBit).mockResolvedValue([basic]);
    vi.mocked(editKnowledgeBitQuestionVariant).mockResolvedValue({ ok: true, variantId: "v2", knowledgeBitId: "kb_1" });

    const result = await updateCard({ cardId: "kb_1", front: " New Q " }, auth);

    expect(editKnowledgeBitQuestionVariant).toHaveBeenCalledWith("v1", "New Q", "Old A");
    expect(embedApprovedKnowledgeBits).toHaveBeenCalledWith(["kb_1"]);
    expect(result).toEqual({ cardId: "kb_1", variantId: "v2", kind: "basic" });
  });

  it("should report not_found for a card with no variants", async () => {
    vi.mocked(listActiveVariantsForBit).mockResolvedValue([]);

    expect(await updateCard({ cardId: "kb_x", back: "A" }, auth)).toEqual({ error: "not_found" });
  });

  it("should refuse an empty edit", async () => {
    expect(await updateCard({ cardId: "kb_1" }, auth)).toEqual({ error: "nothing_to_update" });
  });
});
