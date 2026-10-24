import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateKnowledgeBitFeedback = vi.fn();
const restoreRejectedKnowledgeBit = vi.fn();
const aggregateFeedbackByModel = vi.fn();
const gradeKnowledgeBit = vi.fn();

vi.mock("./knowledge-bit-grade.repo.js", () => ({
  gradeKnowledgeBit: (...args: unknown[]) => gradeKnowledgeBit(...args),
}));

vi.mock("./knowledge-bit-feedback.repo.js", () => ({
  updateKnowledgeBitFeedback: (...args: unknown[]) => updateKnowledgeBitFeedback(...args),
  restoreRejectedKnowledgeBit: (...args: unknown[]) => restoreRejectedKnowledgeBit(...args),
  aggregateFeedbackByModel: (...args: unknown[]) => aggregateFeedbackByModel(...args),
}));

const {
  handleSetKnowledgeBitFeedbackReason,
  handleRestoreRejectedKnowledgeBit,
  handleGetKnowledgeBitFeedbackByModel,
  handleGradeKnowledgeBit,
} = await import("./knowledge-bit-feedback.controller.js");

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

describe("handleSetKnowledgeBitFeedbackReason", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should store a known reason with its note on the rejection", async () => {
    updateKnowledgeBitFeedback.mockResolvedValue(true);

    const res = fakeRes();

    await handleSetKnowledgeBitFeedbackReason(
      fakeReq({ reasonCode: "meta_wording", note: " says according to the text " }),
      res,
      "kbf_1",
    );

    expect(updateKnowledgeBitFeedback).toHaveBeenCalledWith("kbf_1", {
      reasonCode: "meta_wording",
      note: "says according to the text",
    });
    expect(res.status).toBe(200);
  });

  it("should reject a reason code that is not on the list", async () => {
    const res = fakeRes();

    await handleSetKnowledgeBitFeedbackReason(fakeReq({ reasonCode: "i_just_dislike_it" }), res, "kbf_1");

    expect(res.status).toBe(400);
    expect(updateKnowledgeBitFeedback).not.toHaveBeenCalled();
  });

  it("should not accept the unspecified marker as a chosen reason", async () => {
    const res = fakeRes();

    await handleSetKnowledgeBitFeedbackReason(fakeReq({ reasonCode: "unspecified" }), res, "kbf_1");

    expect(res.status).toBe(400);
  });

  it("should reject a note longer than the cap", async () => {
    const res = fakeRes();

    await handleSetKnowledgeBitFeedbackReason(fakeReq({ note: "x".repeat(501) }), res, "kbf_1");

    expect(res.status).toBe(400);
  });

  it("should return 404 when the rejection record does not exist", async () => {
    updateKnowledgeBitFeedback.mockResolvedValue(false);

    const res = fakeRes();

    await handleSetKnowledgeBitFeedbackReason(fakeReq({ reasonCode: "other" }), res, "missing");

    expect(res.status).toBe(404);
  });
});

describe("handleRestoreRejectedKnowledgeBit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should bring a decided suggestion back to the review list", async () => {
    restoreRejectedKnowledgeBit.mockResolvedValue(true);

    const res = fakeRes();

    await handleRestoreRejectedKnowledgeBit(res, "kb_1");

    expect(restoreRejectedKnowledgeBit).toHaveBeenCalledWith("kb_1");
    expect(res.status).toBe(200);
  });

  it("should return 404 when the suggestion is not approved or rejected", async () => {
    restoreRejectedKnowledgeBit.mockResolvedValue(false);

    const res = fakeRes();

    await handleRestoreRejectedKnowledgeBit(res, "kb_1");

    expect(res.status).toBe(404);
  });
});

describe("handleGetKnowledgeBitFeedbackByModel", () => {
  it("should return the per-model statistics as they are", async () => {
    aggregateFeedbackByModel.mockResolvedValue({ models: [] });

    const res = fakeRes();

    await handleGetKnowledgeBitFeedbackByModel(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ models: [] });
  });
});

describe("handleGradeKnowledgeBit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should record a grade with its note for a card that has no decision yet", async () => {
    gradeKnowledgeBit.mockResolvedValue({ status: "ok", feedbackId: "kbf_9" });

    const res = fakeRes();

    await handleGradeKnowledgeBit(fakeReq({ rating: 4, note: " clear " }), res, "kb_1");

    expect(gradeKnowledgeBit).toHaveBeenCalledWith("kb_1", { rating: 4, note: "clear" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, feedbackId: "kbf_9" });
  });

  it.each([0, 6, 2.5, "3"])("should reject the rating %s", async (rating) => {
    const res = fakeRes();

    await handleGradeKnowledgeBit(fakeReq({ rating }), res, "kb_1");

    expect(res.status).toBe(400);
    expect(gradeKnowledgeBit).not.toHaveBeenCalled();
  });

  it("should reject a grade without a rating", async () => {
    const res = fakeRes();

    await handleGradeKnowledgeBit(fakeReq({ note: "hm" }), res, "kb_1");

    expect(res.status).toBe(400);
  });

  it("should reject a note longer than the cap", async () => {
    const res = fakeRes();

    await handleGradeKnowledgeBit(fakeReq({ rating: 3, note: "x".repeat(501) }), res, "kb_1");

    expect(res.status).toBe(400);
  });

  it("should return 404 for an unknown card", async () => {
    gradeKnowledgeBit.mockResolvedValue({ status: "not_found" });

    const res = fakeRes();

    await handleGradeKnowledgeBit(fakeReq({ rating: 3 }), res, "missing");

    expect(res.status).toBe(404);
  });

  it("should refuse to grade a manually written card", async () => {
    gradeKnowledgeBit.mockResolvedValue({ status: "not_applicable" });

    const res = fakeRes();

    await handleGradeKnowledgeBit(fakeReq({ rating: 3 }), res, "kb_manual");

    expect(res.status).toBe(400);
  });
});
