import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const approveKnowledgeBit = vi.fn();
const rejectKnowledgeBit = vi.fn();
const editKnowledgeBitQuestionVariant = vi.fn();
const listPendingKnowledgeBitsForReview = vi.fn();

vi.mock("./knowledge-bit-approval.repo.js", () => ({
  approveKnowledgeBit: (...args: unknown[]) => approveKnowledgeBit(...args),
  rejectKnowledgeBit: (...args: unknown[]) => rejectKnowledgeBit(...args),
  editKnowledgeBitQuestionVariant: (...args: unknown[]) =>
    editKnowledgeBitQuestionVariant(...args),
  listPendingKnowledgeBitsForReview: (...args: unknown[]) =>
    listPendingKnowledgeBitsForReview(...args),
}));

const {
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
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("should return 404 when the bit does not exist", async () => {
    approveKnowledgeBit.mockResolvedValue(false);

    const res = fakeRes();

    await handleApproveKnowledgeBit(res, "missing");

    expect(res.status).toBe(404);
  });
});

describe("handleRejectKnowledgeBit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return ok when the repo rejects the bit", async () => {
    rejectKnowledgeBit.mockResolvedValue(true);

    const res = fakeRes();

    await handleRejectKnowledgeBit(res, "kb_1");

    expect(rejectKnowledgeBit).toHaveBeenCalledWith("kb_1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("should return 404 when the bit does not exist", async () => {
    rejectKnowledgeBit.mockResolvedValue(false);

    const res = fakeRes();

    await handleRejectKnowledgeBit(res, "missing");

    expect(res.status).toBe(404);
  });
});

describe("handleEditKnowledgeBitQuestionVariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should dispatch the parsed prompt and answer to the repo and return the new variant", async () => {
    editKnowledgeBitQuestionVariant.mockResolvedValue({ ok: true, variantId: "kbqv_new" });

    const req = fakeReq({ prompt: "New prompt", answer: "New answer" });
    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(req, res, "kbqv_1");

    expect(editKnowledgeBitQuestionVariant).toHaveBeenCalledWith(
      "kbqv_1",
      "New prompt",
      "New answer",
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, variantId: "kbqv_new" });
  });

  it("should return 404 not_found when the repo reports the variant is missing", async () => {
    editKnowledgeBitQuestionVariant.mockResolvedValue({ error: "not_found" });

    const req = fakeReq({ prompt: "New prompt", answer: "New answer" });
    const res = fakeRes();

    await handleEditKnowledgeBitQuestionVariant(req, res, "missing");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
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
});
