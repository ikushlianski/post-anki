import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setKnowledgeBitFeedbackReason = vi.fn();
const restoreRejectedKnowledgeBit = vi.fn();
const aggregateFeedbackByModel = vi.fn();

vi.mock("./knowledge-bit-feedback.repo.js", () => ({
  setKnowledgeBitFeedbackReason: (...args: unknown[]) => setKnowledgeBitFeedbackReason(...args),
  restoreRejectedKnowledgeBit: (...args: unknown[]) => restoreRejectedKnowledgeBit(...args),
  aggregateFeedbackByModel: (...args: unknown[]) => aggregateFeedbackByModel(...args),
}));

const {
  handleSetKnowledgeBitFeedbackReason,
  handleRestoreRejectedKnowledgeBit,
  handleGetKnowledgeBitFeedbackByModel,
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
    setKnowledgeBitFeedbackReason.mockResolvedValue(true);

    const res = fakeRes();

    await handleSetKnowledgeBitFeedbackReason(
      fakeReq({ reasonCode: "meta_wording", note: " says according to the text " }),
      res,
      "kbf_1",
    );

    expect(setKnowledgeBitFeedbackReason).toHaveBeenCalledWith("kbf_1", {
      reasonCode: "meta_wording",
      note: "says according to the text",
    });
    expect(res.status).toBe(200);
  });

  it("should reject a reason code that is not on the list", async () => {
    const res = fakeRes();

    await handleSetKnowledgeBitFeedbackReason(fakeReq({ reasonCode: "i_just_dislike_it" }), res, "kbf_1");

    expect(res.status).toBe(400);
    expect(setKnowledgeBitFeedbackReason).not.toHaveBeenCalled();
  });

  it("should not accept the unspecified marker as a chosen reason", async () => {
    const res = fakeRes();

    await handleSetKnowledgeBitFeedbackReason(fakeReq({ reasonCode: "unspecified" }), res, "kbf_1");

    expect(res.status).toBe(400);
  });

  it("should reject a note longer than the cap", async () => {
    const res = fakeRes();

    await handleSetKnowledgeBitFeedbackReason(fakeReq({ reasonCode: "other", note: "x".repeat(501) }), res, "kbf_1");

    expect(res.status).toBe(400);
  });

  it("should return 404 when the rejection record does not exist", async () => {
    setKnowledgeBitFeedbackReason.mockResolvedValue(false);

    const res = fakeRes();

    await handleSetKnowledgeBitFeedbackReason(fakeReq({ reasonCode: "other" }), res, "missing");

    expect(res.status).toBe(404);
  });
});

describe("handleRestoreRejectedKnowledgeBit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should bring a rejected suggestion back to the review list", async () => {
    restoreRejectedKnowledgeBit.mockResolvedValue(true);

    const res = fakeRes();

    await handleRestoreRejectedKnowledgeBit(res, "kb_1");

    expect(restoreRejectedKnowledgeBit).toHaveBeenCalledWith("kb_1");
    expect(res.status).toBe(200);
  });

  it("should return 404 when the suggestion is not in the rejected state", async () => {
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
