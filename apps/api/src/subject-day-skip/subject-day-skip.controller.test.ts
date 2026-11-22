import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./subject-day-skip.repo.js", () => ({
  listSkippedSubjects: vi.fn(),
  skipSubjectForDay: vi.fn(),
  subjectExists: vi.fn(),
  unskipSubjectForDay: vi.fn(),
}));

const repo = await import("./subject-day-skip.repo.js");
const { handleListSubjectDaySkips, handleSkipSubjectForDay, handleUnskipSubjectForDay } = await import(
  "./subject-day-skip.controller.js"
);

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
  vi.resetAllMocks();
  vi.mocked(repo.listSkippedSubjects).mockResolvedValue({ dayKey: "2090-03-10", subjectIds: ["s1"] });
  vi.mocked(repo.subjectExists).mockResolvedValue(true);
});

describe("subject day skip controller", () => {
  it("should list the skipped subjects for the requested time zone", async () => {
    const res = fakeRes();

    await handleListSubjectDaySkips(res, "tz=Europe/Warsaw");

    expect(repo.listSkippedSubjects).toHaveBeenCalledWith({ tz: "Europe/Warsaw", now: expect.any(Date) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dayKey: "2090-03-10", subjectIds: ["s1"] });
  });

  it("should reject an invalid time zone before touching any data", async () => {
    const res = fakeRes();

    await handleListSubjectDaySkips(res, "tz=Mars/Base");

    expect(res.status).toBe(400);
    expect(repo.listSkippedSubjects).not.toHaveBeenCalled();
  });

  it("should skip an existing subject and return the updated list", async () => {
    const res = fakeRes();

    await handleSkipSubjectForDay(res, "s1", "tz=UTC");

    expect(repo.skipSubjectForDay).toHaveBeenCalledWith("s1", { tz: "UTC", now: expect.any(Date) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dayKey: "2090-03-10", subjectIds: ["s1"] });
  });

  it("should answer 404 when skipping a subject that does not exist", async () => {
    vi.mocked(repo.subjectExists).mockResolvedValue(false);

    const res = fakeRes();

    await handleSkipSubjectForDay(res, "missing", "tz=UTC");

    expect(res.status).toBe(404);
    expect(repo.skipSubjectForDay).not.toHaveBeenCalled();
  });

  it("should reject an invalid time zone when skipping", async () => {
    const res = fakeRes();

    await handleSkipSubjectForDay(res, "s1", "tz=nope");

    expect(res.status).toBe(400);
    expect(repo.skipSubjectForDay).not.toHaveBeenCalled();
  });

  it("should unskip a subject and return the updated list", async () => {
    const res = fakeRes();

    await handleUnskipSubjectForDay(res, "s1", "tz=UTC");

    expect(repo.unskipSubjectForDay).toHaveBeenCalledWith("s1", { tz: "UTC", now: expect.any(Date) });
    expect(res.status).toBe(200);
  });

  it("should reject an invalid time zone when unskipping", async () => {
    const res = fakeRes();

    await handleUnskipSubjectForDay(res, "s1", "tz=nope");

    expect(res.status).toBe(400);
    expect(repo.unskipSubjectForDay).not.toHaveBeenCalled();
  });
});
