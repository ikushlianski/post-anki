import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const approveKnowledgeBit = vi.fn();
const rejectKnowledgeBit = vi.fn();
const editKnowledgeBitQuestionVariant = vi.fn();
const listPendingKnowledgeBitsForReview = vi.fn();
const listSourcesNeedingAttention = vi.fn();

vi.mock("./knowledge-source-attention.repo.js", () => ({
  listSourcesNeedingAttention: (...args: unknown[]) => listSourcesNeedingAttention(...args),
}));

const embedApprovedKnowledgeBits = vi.fn();
const editKnowledgeBitClozeNote = vi.fn();

vi.mock("./knowledge-bit-note-edit.repo.js", () => ({
  editKnowledgeBitClozeNote: (...args: unknown[]) => editKnowledgeBitClozeNote(...args),
}));

const editKnowledgeBitOrderedList = vi.fn();

vi.mock("./knowledge-bit-list-edit.repo.js", () => ({
  editKnowledgeBitOrderedList: (...args: unknown[]) => editKnowledgeBitOrderedList(...args),
}));

vi.mock("./knowledge-bit-approval-embedding.orchestrator.js", () => ({
  embedApprovedKnowledgeBits: (...args: unknown[]) => embedApprovedKnowledgeBits(...args),
}));

vi.mock("./knowledge-bit-approval.repo.js", () => ({
  approveKnowledgeBit: (...args: unknown[]) => approveKnowledgeBit(...args),
  rejectKnowledgeBit: (...args: unknown[]) => rejectKnowledgeBit(...args),
  editKnowledgeBitQuestionVariant: (...args: unknown[]) =>
    editKnowledgeBitQuestionVariant(...args),
  listPendingKnowledgeBitsForReview: (...args: unknown[]) =>
    listPendingKnowledgeBitsForReview(...args),
}));

const listPendingReviewSubjectCounts = vi.fn();

vi.mock("./knowledge-bit-pending-subjects.repo.js", () => ({
  listPendingReviewSubjectCounts: (...args: unknown[]) => listPendingReviewSubjectCounts(...args),
}));

const countPendingKnowledgeBitsForReview = vi.fn();

vi.mock("./knowledge-bit-pending-total.repo.js", () => ({
  countPendingKnowledgeBitsForReview: (...args: unknown[]) => countPendingKnowledgeBitsForReview(...args),
}));

const {
  handleListPendingReviewSubjects,
  handleApproveKnowledgeBit,
  handleRejectKnowledgeBit,
  handleEditKnowledgeBitQuestionVariant,
  handleListPendingKnowledgeBitsForReview,
} = await import("./knowledge-bit-approval.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  });

  return readable as unknown as http.IncomingMessage;
}

function fakeRes(): http.ServerResponse & { status: number | null; body: unknown } {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

describe("handleApproveKnowledgeBit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return ok when the repo approves the bit", async () => {
    approveKnowledgeBit.mockResolvedValue(true);

    const res = fakeRes();

    await handleApproveKnowledgeBit(res, "kb_1");

    expect(approveKnowledgeBit).toHaveBeenCalledWith("kb_1");
    expect(embedApprovedKnowledgeBits).toHaveBeenCalledWith(["kb_1"]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("should return 404 when the bit does not exist", async () => {
    approveKnowledgeBit.mockResolvedValue("not_found");

    const res = fakeRes();

    await handleApproveKnowledgeBit(res, "missing");

    expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();

    expect(res.status).toBe(404);
  });

  it("should return 409 when the bit is blocked from approval", async () => {
    approveKnowledgeBit.mockResolvedValue("blocked");

    const res = fakeRes();

    await handleApproveKnowledgeBit(res, "kb_rejected");

    expect(res.status).toBe(409);
  });

  it("should return 409 when the bit has no active variant yet", async () => {
    approveKnowledgeBit.mockResolvedValue("no_variant");

    const res = fakeRes();

    await handleApproveKnowledgeBit(res, "kb_no_variant");

    expect(res.status).toBe(409);
  });
});

describe("handleRejectKnowledgeBit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return ok when the repo rejects the bit", async () => {
    rejectKnowledgeBit.mockResolvedValue({ ok: true, feedbackId: "kbf_1" });

    const res = fakeRes();

    await handleRejectKnowledgeBit(res, "kb_1");

    expect(rejectKnowledgeBit).toHaveBeenCalledWith("kb_1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, feedbackId: "kbf_1" });
  });

  it("should return 404 when the bit does not exist", async () => {
    rejectKnowledgeBit.mockResolvedValue({ ok: false, reason: "not_found" });

    const res = fakeRes();

    await handleRejectKnowledgeBit(res, "missing");

    expect(res.status).toBe(404);
  });

  it("should return 409 when the bit is blocked from rejection", async () => {
    rejectKnowledgeBit.mockResolvedValue({ ok: false, reason: "blocked" });

    const res = fakeRes();

    await handleRejectKnowledgeBit(res, "kb_approved");

    expect(res.status).toBe(409);
  });
});

describe("handleEditKnowledgeBitQuestionVariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should dispatch the parsed prompt and answer to the repo and return the new variant", async () => {
    editKnowledgeBitQuestionVariant.mockResolvedValue({
      ok: true,
      variantId: "kbqv_new",
      knowledgeBitId: "kb_1",
    });

    const req = fakeReq({ prompt: "New prompt", answer: "New answer" });
    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(req, res, "kbqv_1");

    expect(editKnowledgeBitQuestionVariant).toHaveBeenCalledWith(
      "kbqv_1",
      "New prompt",
      "New answer",
      undefined,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, variantId: "kbqv_new" });
  });

  it("should pass an edited context through so the learner can change who is speaking", async () => {
    editKnowledgeBitQuestionVariant.mockResolvedValue({ ok: true, variantId: "kbqv_new", knowledgeBitId: "kb_1" });

    await handleEditKnowledgeBitQuestionVariant(
      fakeReq({ prompt: "New prompt", answer: "New answer", context: " To a manager " }),
      fakeRes(),
      "kbqv_1",
    );

    expect(editKnowledgeBitQuestionVariant).toHaveBeenCalledWith("kbqv_1", "New prompt", "New answer", "To a manager");
  });

  it("an edited card is re-embedded for its bit so search finds the new wording", async () => {
    editKnowledgeBitQuestionVariant.mockResolvedValue({
      ok: true,
      variantId: "kbqv_new",
      knowledgeBitId: "kb_1",
    });

    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(
      fakeReq({ prompt: "New prompt", answer: "New answer" }),
      res,
      "kbqv_1",
    );

    expect(embedApprovedKnowledgeBits).toHaveBeenCalledTimes(1);
    expect(embedApprovedKnowledgeBits).toHaveBeenCalledWith(["kb_1"]);
    expect(res.body).toEqual({ ok: true, variantId: "kbqv_new" });
  });

  it("a rejected edit triggers no embedding", async () => {
    editKnowledgeBitQuestionVariant.mockResolvedValue({ error: "blocked" });

    await handleEditKnowledgeBitQuestionVariant(
      fakeReq({ prompt: "New prompt", answer: "New answer" }),
      fakeRes(),
      "kbqv_1",
    );

    expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();
  });

  it("should return 404 not_found when the repo reports the variant is missing", async () => {
    editKnowledgeBitQuestionVariant.mockResolvedValue({ error: "not_found" });

    const req = fakeReq({ prompt: "New prompt", answer: "New answer" });
    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(req, res, "missing");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("should return 409 when the repo reports the variant edit is blocked", async () => {
    editKnowledgeBitQuestionVariant.mockResolvedValue({ error: "blocked" });

    const req = fakeReq({ prompt: "New prompt", answer: "New answer" });
    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(req, res, "kbqv_blocked");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "blocked" });
  });

  it("should save a cloze note edit as a whole note and re-embed the bit", async () => {
    editKnowledgeBitClozeNote.mockResolvedValue({
      ok: true,
      knowledgeBitId: "kb_1",
      variantId: "kbqv_new",
      cards: [{ id: "kbqv_new", order: 1, prompt: "p", answer: "a" }],
    });

    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(fakeReq({ note: "A {{c1::b}} and {{c2::c}}" }), res, "kbqv_1");

    expect(editKnowledgeBitClozeNote).toHaveBeenCalledWith("kbqv_1", "A {{c1::b}} and {{c2::c}}");
    expect(editKnowledgeBitQuestionVariant).not.toHaveBeenCalled();
    expect(embedApprovedKnowledgeBits).toHaveBeenCalledWith(["kb_1"]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, variantId: "kbqv_new" });
  });

  it("should tell the learner why a cloze note was refused", async () => {
    editKnowledgeBitClozeNote.mockResolvedValue({ error: "invalid_note", reason: "nested" });

    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(fakeReq({ note: "{{c1::a {{c2::b}}}}" }), res, "kbqv_1");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_note", reason: "nested" });
    expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();
  });

  it("should save an ordered list edit as a whole list and re-embed the bit", async () => {
    editKnowledgeBitOrderedList.mockResolvedValue({ ok: true, knowledgeBitId: "kb_1", variantId: "kbqv_new", cards: [] });

    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(fakeReq({ list: "T\na\nb\nc" }), res, "kbqv_1");

    expect(editKnowledgeBitOrderedList).toHaveBeenCalledWith("kbqv_1", "T\na\nb\nc");
    expect(editKnowledgeBitQuestionVariant).not.toHaveBeenCalled();
    expect(embedApprovedKnowledgeBits).toHaveBeenCalledWith(["kb_1"]);
    expect(res.body).toMatchObject({ ok: true, variantId: "kbqv_new" });
  });

  it("should tell the learner why an ordered list was refused", async () => {
    editKnowledgeBitOrderedList.mockResolvedValue({ error: "invalid_list", reason: "too_few_steps" });

    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(fakeReq({ list: "T\na\nb" }), res, "kbqv_1");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_list", reason: "too_few_steps" });
    expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();
  });

  it("should answer 400 when a plain edit targets a cloze card", async () => {
    editKnowledgeBitQuestionVariant.mockResolvedValue({ error: "wrong_shape" });

    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(fakeReq({ prompt: "p", answer: "a" }), res, "kbqv_1");

    expect(res.status).toBe(400);
  });

  it("should reject an empty prompt with a 400 and never call the repo", async () => {
    const req = fakeReq({ prompt: "", answer: "New answer" });
    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(req, res, "kbqv_1");

    expect(res.status).toBe(400);
    expect(editKnowledgeBitQuestionVariant).not.toHaveBeenCalled();
  });
});

describe("handleListPendingKnowledgeBitsForReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the pending sources from the repo", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([
      { knowledgeSourceId: "ksrc_1", sourceText: "Prose.", bits: [] },
    ]);

    const res = fakeRes();

    await handleListPendingKnowledgeBitsForReview(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ knowledgeSourceId: "ksrc_1", sourceText: "Prose.", bits: [] }]);
  });

  it("should limit the list to the subject the learner chose", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([]);

    await handleListPendingKnowledgeBitsForReview(fakeRes(), "?subjectId=sub_1");

    expect(listPendingKnowledgeBitsForReview).toHaveBeenCalledWith(expect.any(Number), undefined, "sub_1", undefined);
  });

  it("should list every subject when no subject is chosen", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([]);

    await handleListPendingKnowledgeBitsForReview(fakeRes(), "");

    expect(listPendingKnowledgeBitsForReview).toHaveBeenCalledWith(expect.any(Number), undefined, undefined, undefined);
  });

  it("should fetch only as many pending cards as the Triage window asks for", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([]);

    await handleListPendingKnowledgeBitsForReview(fakeRes(), "?limit=20&subjectId=sub_1");

    expect(listPendingKnowledgeBitsForReview).toHaveBeenCalledWith(20, undefined, "sub_1", undefined);
  });

  it("should keep returning up to 200 pending cards when no limit is asked for", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([]);

    await handleListPendingKnowledgeBitsForReview(fakeRes(), "");

    expect(listPendingKnowledgeBitsForReview).toHaveBeenCalledWith(200, undefined, undefined, undefined);
  });

  it.each(["0", "201", "abc", "1.5", ""])("should reject the pending-review limit %j instead of loading the list", async (limit) => {
    const res = fakeRes();

    await handleListPendingKnowledgeBitsForReview(res, `?limit=${limit}`);

    expect(res.status).toBe(400);
    expect(listPendingKnowledgeBitsForReview).not.toHaveBeenCalled();
  });

  it("should not look for notes needing attention unless asked, so older clients see the same list", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([]);

    const res = fakeRes();

    await handleListPendingKnowledgeBitsForReview(res, "?limit=5");

    expect(res.body).toEqual([]);
    expect(listSourcesNeedingAttention).not.toHaveBeenCalled();
  });

  it("should continue after the last card the app already holds when a cursor is sent", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([]);

    await handleListPendingKnowledgeBitsForReview(
      fakeRes(),
      "?limit=50&afterCreatedAt=2026-01-01T00:00:00.123456Z&afterId=kb_9",
    );

    expect(listPendingKnowledgeBitsForReview).toHaveBeenCalledWith(50, undefined, undefined, {
      afterCreatedAt: "2026-01-01T00:00:00.123456Z",
      afterId: "kb_9",
    });
  });

  it("should still report the whole pending total, not the rest after the cursor", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([]);
    countPendingKnowledgeBitsForReview.mockResolvedValue(300);

    const res = fakeRes();

    await handleListPendingKnowledgeBitsForReview(
      res,
      "?includeTotal=1&subjectId=sub_1&afterCreatedAt=2026-01-01T00:00:00Z&afterId=kb_9",
    );

    expect(countPendingKnowledgeBitsForReview).toHaveBeenCalledWith("sub_1");
    expect(res.body).toEqual({ items: [], total: 300 });
  });

  it.each([
    "?afterId=kb_9",
    "?afterCreatedAt=2026-01-01T00:00:00Z",
    "?afterCreatedAt=yesterday&afterId=kb_9",
    "?afterCreatedAt=2026-01-01T00:00:00Z&afterId=",
  ])("should reject the incomplete or malformed cursor %j instead of loading the list", async (query) => {
    const res = fakeRes();

    await handleListPendingKnowledgeBitsForReview(res, query);

    expect(res.status).toBe(400);
    expect(listPendingKnowledgeBitsForReview).not.toHaveBeenCalled();
  });

  it("should return the exact pending total for the chosen subject next to the page when asked", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([{ knowledgeSourceId: "ksrc_1", bits: [] }]);
    countPendingKnowledgeBitsForReview.mockResolvedValue(57);

    const res = fakeRes();

    await handleListPendingKnowledgeBitsForReview(res, "?limit=20&subjectId=sub_1&includeTotal=1");

    expect(countPendingKnowledgeBitsForReview).toHaveBeenCalledWith("sub_1");
    expect(res.body).toEqual({ items: [{ knowledgeSourceId: "ksrc_1", bits: [] }], total: 57 });
  });

  it("should keep the bare list and skip the count when no total is asked for, so other clients are unaffected", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([]);

    const res = fakeRes();

    await handleListPendingKnowledgeBitsForReview(res, "?limit=20");

    expect(res.body).toEqual([]);
    expect(countPendingKnowledgeBitsForReview).not.toHaveBeenCalled();
  });

  it("should put attention notes inside the items when both the total and attention are asked for", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([]);
    countPendingKnowledgeBitsForReview.mockResolvedValue(3);
    listSourcesNeedingAttention.mockResolvedValue([
      {
        knowledgeSourceId: "ksrc_f",
        kind: "failed",
        reason: "no_valid_items",
        firstWords: "Prose",
        sourceText: "Prose",
        since: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const res = fakeRes();

    await handleListPendingKnowledgeBitsForReview(res, "?attention=1&includeTotal=1");

    expect(res.body).toEqual({ items: [expect.objectContaining({ knowledgeSourceId: "ksrc_f" })], total: 3 });
  });

  it("should add notes needing attention as card-less entries when asked", async () => {
    listPendingKnowledgeBitsForReview.mockResolvedValue([]);
    listSourcesNeedingAttention.mockResolvedValue([
      {
        knowledgeSourceId: "ksrc_f",
        kind: "failed",
        reason: "no_valid_items",
        firstWords: "Prose",
        sourceText: "Prose",
        since: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const res = fakeRes();

    await handleListPendingKnowledgeBitsForReview(res, "?attention=1");

    expect(res.body).toEqual([
      expect.objectContaining({
        knowledgeSourceId: "ksrc_f",
        bits: [],
        attention: expect.objectContaining({ kind: "failed", reason: "no_valid_items" }),
      }),
    ]);
  });
});

describe("handleListPendingReviewSubjects", () => {
  it("should return each subject with its pending count for the Triage entry screen", async () => {
    const rows = [{ subjectId: "sub_1", name: "German", path: "Languages / German", pendingCount: 4 }];

    listPendingReviewSubjectCounts.mockResolvedValue(rows);

    const res = fakeRes();

    await handleListPendingReviewSubjects(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });
});
