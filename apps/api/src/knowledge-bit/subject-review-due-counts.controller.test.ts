import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./subject-review-due-counts.repo.js", () => ({ getSubjectReviewDueCounts: vi.fn() }));

const { getSubjectReviewDueCounts } = await import("./subject-review-due-counts.repo.js");
const { handleListSubjectReviewDueCounts } = await import("./subject-review-due-counts.controller.js");

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleListSubjectReviewDueCounts", () => {
  it("should return the per-subject due counts for the requested time zone", async () => {
    vi.mocked(getSubjectReviewDueCounts).mockResolvedValue([{ subjectId: "s1", due: 4 }] as never);

    const res = fakeRes();

    await handleListSubjectReviewDueCounts(res, "tz=Europe/Warsaw");

    expect(getSubjectReviewDueCounts).toHaveBeenCalledWith({ tz: "Europe/Warsaw", now: expect.any(Date) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ subjectId: "s1", due: 4 }]);
  });

  it("should default to UTC and return an empty list when nothing is due", async () => {
    vi.mocked(getSubjectReviewDueCounts).mockResolvedValue([] as never);

    const res = fakeRes();

    await handleListSubjectReviewDueCounts(res, "");

    expect(getSubjectReviewDueCounts).toHaveBeenCalledWith({ tz: "UTC", now: expect.any(Date) });
    expect(res.body).toEqual([]);
  });

  it("should refuse an unknown time zone with 400 and not query", async () => {
    const res = fakeRes();

    await handleListSubjectReviewDueCounts(res, "tz=Not/AZone");

    expect(res.status).toBe(400);
    expect(getSubjectReviewDueCounts).not.toHaveBeenCalled();
  });
});
