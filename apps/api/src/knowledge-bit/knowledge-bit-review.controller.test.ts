import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getKnowledgeBitReviewQueue = vi.hoisted(() => vi.fn());
const recordKnowledgeBitReview = vi.hoisted(() => vi.fn());
const updateKnowledgeBitScheduleControls = vi.hoisted(() => vi.fn());
const undoKnowledgeBitReview = vi.hoisted(() => vi.fn());
const recordActivityToday = vi.hoisted(() => vi.fn());

vi.mock("./knowledge-bit-review-queue.repo.js", () => ({ getKnowledgeBitReviewQueue }));
vi.mock("./knowledge-bit-review.orchestrator.js", () => ({ recordKnowledgeBitReview }));
vi.mock("./knowledge-bit-review-suspension.orchestrator.js", () => ({ updateKnowledgeBitScheduleControls }));
vi.mock("./knowledge-bit-review-undo.orchestrator.js", () => ({ undoKnowledgeBitReview }));
vi.mock("../streak/streak.service.js", () => ({ recordActivityToday }));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn() } }));

import {
  handleListKnowledgeBitReviewCards,
  handleRecordKnowledgeBitReview,
  handleUndoKnowledgeBitReview,
  handleUpdateKnowledgeBitScheduleControls,
} from "./knowledge-bit-review.controller.js";

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const res = { writeHead: vi.fn(), end: vi.fn() };

  return res as unknown as http.ServerResponse & typeof res;
}

function sent(res: ReturnType<typeof fakeRes>): { status: number; body: Record<string, unknown> } {
  return {
    status: vi.mocked(res.writeHead).mock.calls[0]![0] as number,
    body: JSON.parse(vi.mocked(res.end).mock.calls[0]![0] as string),
  };
}

beforeEach(() => {
  getKnowledgeBitReviewQueue.mockReset();
  recordKnowledgeBitReview.mockReset();
  updateKnowledgeBitScheduleControls.mockReset();
  undoKnowledgeBitReview.mockReset();
  recordActivityToday.mockReset();
});

describe("handleListKnowledgeBitReviewCards", () => {
  it("should answer 400 for an unknown time zone", async () => {
    const res = fakeRes();

    await handleListKnowledgeBitReviewCards(res, "tz=Mars%2FBase");

    expect(sent(res).status).toBe(400);
    expect(getKnowledgeBitReviewQueue).not.toHaveBeenCalled();
  });

  it("should answer 400 when the limit is out of range", async () => {
    const res = fakeRes();

    await handleListKnowledgeBitReviewCards(res, "limit=0");

    expect(sent(res).status).toBe(400);
  });

  it("should return the queue for the requested zone", async () => {
    getKnowledgeBitReviewQueue.mockResolvedValue({ cards: [], counts: { new: 0, learning: 0, review: 0 } });
    const res = fakeRes();

    await handleListKnowledgeBitReviewCards(res, "tz=Europe%2FLisbon&limit=5");

    expect(getKnowledgeBitReviewQueue.mock.calls[0]![2]).toMatchObject({ tz: "Europe/Lisbon" });
    expect(sent(res).status).toBe(200);
  });
});

describe("handleListKnowledgeBitReviewCards learn ahead", () => {
  it("should pass no look-ahead when the parameter is absent", async () => {
    getKnowledgeBitReviewQueue.mockResolvedValue({ cards: [] });

    await handleListKnowledgeBitReviewCards(fakeRes(), "limit=5");

    expect(getKnowledgeBitReviewQueue.mock.calls[0]![2]).toMatchObject({ aheadDays: 0 });
  });

  it("should pass the requested look-ahead days to the queue", async () => {
    getKnowledgeBitReviewQueue.mockResolvedValue({ cards: [] });

    await handleListKnowledgeBitReviewCards(fakeRes(), "aheadDays=3");

    expect(getKnowledgeBitReviewQueue.mock.calls[0]![2]).toMatchObject({ aheadDays: 3 });
  });

  it("should answer 400 when the look-ahead is above 30 days", async () => {
    const res = fakeRes();

    await handleListKnowledgeBitReviewCards(res, "aheadDays=31");

    expect(sent(res).status).toBe(400);
  });
});

describe("handleRecordKnowledgeBitReview", () => {
  it("should answer 400 and record nothing for an unknown grade", async () => {
    const res = fakeRes();

    await handleRecordKnowledgeBitReview(fakeReq({ variantId: "v1", grade: "perfect" }), res);

    expect(sent(res).status).toBe(400);
    expect(recordKnowledgeBitReview).not.toHaveBeenCalled();
  });

  it("should answer 404 for an unknown card", async () => {
    recordKnowledgeBitReview.mockResolvedValue({ ok: false, error: "variant_not_found" });
    const res = fakeRes();

    await handleRecordKnowledgeBitReview(fakeReq({ variantId: "v1", grade: "good" }), res);

    expect(sent(res)).toEqual({ status: 404, body: { error: "variant_not_found" } });
    expect(recordActivityToday).not.toHaveBeenCalled();
  });

  it("should answer 403 for a card that is not approved", async () => {
    recordKnowledgeBitReview.mockResolvedValue({ ok: false, error: "not_approved" });
    const res = fakeRes();

    await handleRecordKnowledgeBitReview(fakeReq({ variantId: "v1", grade: "good" }), res);

    expect(sent(res).status).toBe(403);
  });

  it("should answer 201 and count the day as active", async () => {
    recordKnowledgeBitReview.mockResolvedValue({ ok: true, reviewId: "r1" });
    const res = fakeRes();

    await handleRecordKnowledgeBitReview(fakeReq({ variantId: "v1", grade: "good" }), res);

    expect(sent(res)).toEqual({ status: 201, body: { reviewId: "r1" } });
    expect(recordActivityToday).toHaveBeenCalledTimes(1);
  });

  it("should still answer 201 when recording the streak activity fails", async () => {
    recordKnowledgeBitReview.mockResolvedValue({ ok: true, reviewId: "r1" });
    recordActivityToday.mockRejectedValue(new Error("db"));
    const res = fakeRes();

    await handleRecordKnowledgeBitReview(fakeReq({ variantId: "v1", grade: "good" }), res);

    expect(sent(res).status).toBe(201);
  });
});

describe("handleRecordKnowledgeBitReview offline grades", () => {
  it("should answer 400 review_time_out_of_range for a grade older than 14 days", async () => {
    const res = fakeRes();
    const old = new Date(Date.now() - 20 * 86_400_000).toISOString();

    await handleRecordKnowledgeBitReview(
      fakeReq({ variantId: "v1", grade: "good", reviewedAt: old, sentAt: new Date().toISOString() }),
      res,
    );

    expect(sent(res)).toEqual({ status: 400, body: { error: "review_time_out_of_range" } });
    expect(recordKnowledgeBitReview).not.toHaveBeenCalled();
  });

  it("should grade at the original review time and count that day as active", async () => {
    recordKnowledgeBitReview.mockResolvedValue({ ok: true, reviewId: "r1" });
    const res = fakeRes();
    const earlier = new Date(Date.now() - 3_600_000).toISOString();

    await handleRecordKnowledgeBitReview(
      fakeReq({ variantId: "v1", grade: "good", reviewedAt: earlier, sentAt: new Date().toISOString() }),
      res,
    );

    const gradedAt = recordKnowledgeBitReview.mock.calls[0]![1] as Date;

    expect(Math.abs(gradedAt.getTime() - new Date(earlier).getTime())).toBeLessThan(2_000);
    expect(recordActivityToday.mock.calls[0]![0]).toBe(gradedAt.toISOString());
  });

  it("should not count a superseded grade as activity", async () => {
    recordKnowledgeBitReview.mockResolvedValue({ ok: true, reviewId: "r1", superseded: true });
    const res = fakeRes();

    await handleRecordKnowledgeBitReview(fakeReq({ variantId: "v1", grade: "good" }), res);

    expect(sent(res).status).toBe(201);
    expect(recordActivityToday).not.toHaveBeenCalled();
  });
});

describe("handleUndoKnowledgeBitReview", () => {
  it("should answer 404 when there is no review to undo", async () => {
    undoKnowledgeBitReview.mockResolvedValue({ ok: false, error: "review_not_found" });
    const res = fakeRes();

    await handleUndoKnowledgeBitReview(res, "r1");

    expect(sent(res)).toEqual({ status: 404, body: { error: "review_not_found" } });
  });

  it("should answer 409 when a newer review exists", async () => {
    undoKnowledgeBitReview.mockResolvedValue({ ok: false, error: "not_latest" });
    const res = fakeRes();

    await handleUndoKnowledgeBitReview(res, "r1");

    expect(sent(res).status).toBe(409);
  });

  it("should answer 200 with the restored state", async () => {
    undoKnowledgeBitReview.mockResolvedValue({ ok: true, knowledgeBitId: "k1" });
    const res = fakeRes();

    await handleUndoKnowledgeBitReview(res, "r1");

    expect(sent(res)).toEqual({ status: 200, body: { knowledgeBitId: "k1" } });
  });
});

describe("handleUpdateKnowledgeBitScheduleControls", () => {
  it("should answer 400 when neither suspended nor buried is given", async () => {
    const res = fakeRes();

    await handleUpdateKnowledgeBitScheduleControls(fakeReq({}), res, "k1");

    expect(sent(res).status).toBe(400);
  });

  it("should answer 400 for a bad time zone", async () => {
    const res = fakeRes();

    await handleUpdateKnowledgeBitScheduleControls(fakeReq({ suspended: true, tz: "Mars/Base" }), res, "k1");

    expect(sent(res).status).toBe(400);
  });

  it("should answer 404 for an unknown card", async () => {
    updateKnowledgeBitScheduleControls.mockResolvedValue({ ok: false, error: "not_found" });
    const res = fakeRes();

    await handleUpdateKnowledgeBitScheduleControls(fakeReq({ suspended: true }), res, "nope");

    expect(sent(res).status).toBe(404);
  });

  it("should answer 200 with the new schedule state", async () => {
    updateKnowledgeBitScheduleControls.mockResolvedValue({ ok: true, suspended: true });
    const res = fakeRes();

    await handleUpdateKnowledgeBitScheduleControls(fakeReq({ suspended: true }), res, "k1");

    expect(updateKnowledgeBitScheduleControls).toHaveBeenCalledWith("k1", { suspended: true, tz: "UTC" });
    expect(sent(res)).toEqual({ status: 200, body: { suspended: true } });
  });
});
