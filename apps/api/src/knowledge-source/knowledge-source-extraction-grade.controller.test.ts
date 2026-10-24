import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertSourceExtractionGrade = vi.fn();

vi.mock("./knowledge-source-extraction-grade.repo.js", () => ({
  upsertSourceExtractionGrade: (...args: unknown[]) => upsertSourceExtractionGrade(...args),
}));

const { handleSetSourceExtractionGrade } = await import("./knowledge-source-extraction-grade.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

function fakeRes() {
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

describe("handleSetSourceExtractionGrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should store the grade with its note and return what was saved", async () => {
    upsertSourceExtractionGrade.mockResolvedValue({ rating: 4, note: "missed one claim", run: 2 });

    const res = fakeRes();

    await handleSetSourceExtractionGrade(fakeReq({ rating: 4, note: "missed one claim" }), res, "ks_1");

    expect(upsertSourceExtractionGrade).toHaveBeenCalledWith("ks_1", { rating: 4, note: "missed one claim" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, grade: { rating: 4, note: "missed one claim", run: 2 } });
  });

  it.each([0, 6, 3.5])("should reject a grade of %s", async (rating) => {
    const res = fakeRes();

    await handleSetSourceExtractionGrade(fakeReq({ rating }), res, "ks_1");

    expect(res.status).toBe(400);
    expect(upsertSourceExtractionGrade).not.toHaveBeenCalled();
  });

  it("should reject a missing grade", async () => {
    const res = fakeRes();

    await handleSetSourceExtractionGrade(fakeReq({ note: "only a note" }), res, "ks_1");

    expect(res.status).toBe(400);
  });

  it("should reject a note longer than the cap", async () => {
    const res = fakeRes();

    await handleSetSourceExtractionGrade(fakeReq({ rating: 3, note: "x".repeat(501) }), res, "ks_1");

    expect(res.status).toBe(400);
  });

  it("should return 404 for a source that does not exist", async () => {
    upsertSourceExtractionGrade.mockResolvedValue(null);

    const res = fakeRes();

    await handleSetSourceExtractionGrade(fakeReq({ rating: 3 }), res, "missing");

    expect(res.status).toBe(404);
  });
});
