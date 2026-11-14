import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../knowledge-bit/knowledge-bit-duplicate-finder.js", () => ({ findDuplicateCards: vi.fn() }));
vi.mock("../shared/log.js", () => ({ log: { error: vi.fn() } }));
vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("./subject-ref.js", () => ({ resolveSubjectForWrite: vi.fn() }));
vi.mock("./manual-card-source.repo.js", () => ({ getOrCreateManualCardSource: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-manual-item.repo.js", () => ({ insertManualKnowledgeItem: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-read.repo.js", () => ({ getKnowledgeBitById: vi.fn() }));
vi.mock("../knowledge-bit/pipeline-kick.starter.js", () => ({ startKnowledgeBitPipelineKick: vi.fn() }));

const { resolveSubjectForWrite } = await import("./subject-ref.js");
const { getOrCreateManualCardSource } = await import("./manual-card-source.repo.js");
const { insertManualKnowledgeItem } = await import("../knowledge-bit/knowledge-bit-manual-item.repo.js");
const { getKnowledgeBitById } = await import("../knowledge-bit/knowledge-bit-read.repo.js");
const { findDuplicateCards } = await import("../knowledge-bit/knowledge-bit-duplicate-finder.js");
const { createCard } = await import("./create-card.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

const existing = {
  id: "kb_old",
  front: "Q",
  back: "A",
  subject: null,
  similarity: 1,
  matchKind: "literal" as const,
  kind: "duplicate" as const,
};

const auth = { scopes: ["cards:write"] };

function subjectOk() {
  vi.mocked(resolveSubjectForWrite).mockResolvedValue({ subjectId: "sub_1", subjectPath: "English/Words" });
  vi.mocked(getOrCreateManualCardSource).mockResolvedValue("ks_1");
}

describe("createCard", () => {
  beforeEach(() => {
    vi.mocked(findDuplicateCards).mockResolvedValue({ matches: [], semanticChecked: true });
  });

  it("should refuse a token without cards:write before touching subjects", async () => {
    const result = await createCard({ subject: "English", front: "Q", back: "A" }, { scopes: ["knowledge:write"] });

    expect(result).toEqual({ error: "missing_scope" });
    expect(resolveSubjectForWrite).not.toHaveBeenCalled();
  });

  it("should not save and should return the matches when a duplicate or similar card exists", async () => {
    subjectOk();
    vi.mocked(findDuplicateCards).mockResolvedValue({ matches: [existing], semanticChecked: false });

    const result = await createCard({ subject: "English", front: "Q", back: "A" }, auth);

    expect(result).toMatchObject({ error: "possible_duplicates", semanticChecked: false, matches: [existing] });
    expect(insertManualKnowledgeItem).not.toHaveBeenCalled();
  });

  it("should save despite matches when the caller confirms with allowDuplicate", async () => {
    subjectOk();
    vi.mocked(insertManualKnowledgeItem).mockResolvedValue({ ok: true, item: { id: "kb_2", variants: [] } } as never);
    vi.mocked(getKnowledgeBitById).mockResolvedValue({ approvalState: "pending" } as never);

    const result = await createCard({ subject: "English", front: "Q", back: "A", allowDuplicate: true }, auth);

    expect(findDuplicateCards).not.toHaveBeenCalled();
    expect(insertManualKnowledgeItem).toHaveBeenCalledWith("ks_1", expect.anything(), undefined, true);
    expect(result).toMatchObject({ cardId: "kb_2" });
  });

  it("should add a front/back card to the subject's manual source and report its state", async () => {
    subjectOk();
    vi.mocked(insertManualKnowledgeItem).mockResolvedValue({
      ok: true,
      item: { id: "kb_1", variants: [{ id: "v1" }] },
    } as never);
    vi.mocked(getKnowledgeBitById).mockResolvedValue({ approvalState: "approved" } as never);

    const result = await createCard({ subject: "English/Words", front: " Q ", back: "A" }, auth);

    expect(insertManualKnowledgeItem).toHaveBeenCalledWith("ks_1", expect.objectContaining({ front: "Q", back: "A" }), undefined, false);
    expect(result).toEqual({
      cardId: "kb_1",
      subjectId: "sub_1",
      subjectPath: "English/Words",
      approvalState: "approved",
      variantCount: 1,
    });
  });

  it("should reject a card with an empty back and create nothing", async () => {
    const result = await createCard({ subject: "English", front: "Q", back: "  " }, auth);

    expect(result).toMatchObject({ error: "invalid_input" });
    expect(insertManualKnowledgeItem).not.toHaveBeenCalled();
  });

  it("should explain a cloze note without gaps", async () => {
    subjectOk();
    vi.mocked(insertManualKnowledgeItem).mockResolvedValue({ ok: false, error: "invalid_cloze", reason: "no_gaps" } as never);

    const result = await createCard({ subject: "English", cloze: "{{c1::x" }, auth);

    expect(result).toMatchObject({ error: "invalid_cloze" });
  });

  it("should report a duplicate card", async () => {
    subjectOk();
    vi.mocked(insertManualKnowledgeItem).mockResolvedValue({ ok: false, error: "duplicate_card" });

    expect(await createCard({ subject: "English", front: "Q", back: "A" }, auth)).toEqual({ error: "duplicate_card" });
  });
});
