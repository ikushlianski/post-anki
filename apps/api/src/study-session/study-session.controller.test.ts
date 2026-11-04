import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./study-session.repo.js", () => ({
  getStudySession: vi.fn(),
  insertStudySession: vi.fn(),
  recordStudySessionAnswer: vi.fn(),
  startStudySession: vi.fn(),
}));
vi.mock("./study-session.service.js", () => ({
  completeSession: vi.fn(),
  getConsistency: vi.fn(),
  getSessionPush: vi.fn(),
  listSessionsForSchedule: vi.fn(),
}));

const { getStudySession, insertStudySession, recordStudySessionAnswer, startStudySession } =
  await import("./study-session.repo.js");
const { completeSession, getConsistency, getSessionPush } =
  await import("./study-session.service.js");
const {
  handleCreateStudySession,
  handleEndStudySession,
  handleGetStudySessionConsistency,
  handleGetStudySessionPush,
  handleRecordStudySessionAnswer,
  handleStartStudySession,
} = await import("./study-session.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

function fakeRes(): http.ServerResponse & {
  status: number | null;
  body: unknown;
} {
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

  return res as unknown as http.ServerResponse & {
    status: number | null;
    body: unknown;
  };
}

const session = {
  id: "ss_1",
  startedAt: "2026-01-01T00:00:00.000Z",
  plannedDurationMinutes: 20,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleCreateStudySession", () => {
  it("should refuse a session with a non-positive planned duration", async () => {
    const res = fakeRes();

    await handleCreateStudySession(fakeReq({ plannedDurationMinutes: 0 }), res);

    expect(res.status).toBe(400);
    expect(insertStudySession).not.toHaveBeenCalled();
  });

  it("should answer 400 for an unparseable scheduled date", async () => {
    const res = fakeRes();

    await handleCreateStudySession(
      fakeReq({ plannedDurationMinutes: 20, scheduledFor: "next tuesday" }),
      res,
    );

    expect(res.status).toBe(400);
    expect(insertStudySession).not.toHaveBeenCalled();
  });

  it("should answer 400 for a duration beyond a day", async () => {
    const res = fakeRes();

    await handleCreateStudySession(fakeReq({ plannedDurationMinutes: 5_000_000_000 }), res);

    expect(res.status).toBe(400);
    expect(insertStudySession).not.toHaveBeenCalled();
  });

  it("should create the session and answer 201", async () => {
    vi.mocked(insertStudySession).mockResolvedValue(session);

    const res = fakeRes();

    await handleCreateStudySession(fakeReq({ plannedDurationMinutes: 20 }), res);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(session);
  });
});

describe("handleStartStudySession", () => {
  it("should answer 404 for an unknown session", async () => {
    vi.mocked(startStudySession).mockResolvedValue(null as never);

    const res = fakeRes();

    await handleStartStudySession(res, "ss_x");

    expect(res.status).toBe(404);
  });

  it("should return the started session", async () => {
    vi.mocked(startStudySession).mockResolvedValue(session);

    const res = fakeRes();

    await handleStartStudySession(res, "ss_1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(session);
  });
});

describe("handleEndStudySession", () => {
  it("should refuse a non-boolean end request", async () => {
    const res = fakeRes();

    await handleEndStudySession(fakeReq({ userRequestedEnd: "yes" }), res, "ss_1");

    expect(res.status).toBe(400);
  });

  it("should answer 404 for an unknown session", async () => {
    vi.mocked(getStudySession).mockResolvedValue(null as never);

    const res = fakeRes();

    await handleEndStudySession(fakeReq({ userRequestedEnd: true }), res, "ss_x");

    expect(res.status).toBe(404);
    expect(completeSession).not.toHaveBeenCalled();
  });

  it("should refuse to end a session that is already finished", async () => {
    vi.mocked(getStudySession).mockResolvedValue({ id: "ss_1", status: "completed" } as never);

    const res = fakeRes();

    await handleEndStudySession(fakeReq({ userRequestedEnd: true }), res, "ss_1");

    expect(res.status).toBe(409);
    expect(completeSession).not.toHaveBeenCalled();
  });

  it("should complete the session when the user asks to end it", async () => {
    vi.mocked(getStudySession).mockResolvedValue(session);
    vi.mocked(completeSession).mockResolvedValue({
      id: "ss_1",
      status: "completed",
    } as never);

    const res = fakeRes();

    await handleEndStudySession(fakeReq({ userRequestedEnd: true }), res, "ss_1");

    expect(completeSession).toHaveBeenCalledWith("ss_1", expect.any(Date));
    expect(res.body).toEqual({ id: "ss_1", status: "completed" });
  });

  it("should keep the session open when time is not up and the user did not ask to end", async () => {
    vi.mocked(getStudySession).mockResolvedValue({
      id: "ss_1",
      startedAt: new Date().toISOString(),
      plannedDurationMinutes: 20,
    } as never);

    const res = fakeRes();

    await handleEndStudySession(fakeReq({}), res, "ss_1");

    expect(completeSession).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});

describe("handleRecordStudySessionAnswer", () => {
  it("should refuse an answer without a correct flag", async () => {
    const res = fakeRes();

    await handleRecordStudySessionAnswer(fakeReq({}), res, "ss_1");

    expect(res.status).toBe(400);
    expect(recordStudySessionAnswer).not.toHaveBeenCalled();
  });

  it("should answer 404 for an unknown session", async () => {
    vi.mocked(recordStudySessionAnswer).mockResolvedValue(null as never);

    const res = fakeRes();

    await handleRecordStudySessionAnswer(fakeReq({ correct: true }), res, "ss_x");

    expect(res.status).toBe(404);
  });

  it("should record the answer and return the session", async () => {
    vi.mocked(recordStudySessionAnswer).mockResolvedValue(session);

    const res = fakeRes();

    await handleRecordStudySessionAnswer(fakeReq({ correct: false }), res, "ss_1");

    expect(recordStudySessionAnswer).toHaveBeenCalledWith("ss_1", false);
    expect(res.body).toEqual(session);
  });
});

describe("handleGetStudySessionPush", () => {
  it("should answer 404 when the service reports an error", async () => {
    vi.mocked(getSessionPush).mockResolvedValue({
      error: "not_found",
    } as never);

    const res = fakeRes();

    await handleGetStudySessionPush(res, "ss_x", null, null);

    expect(res.status).toBe(404);
  });

  it("should default to socratic for an unknown mode and split excluded gaps", async () => {
    vi.mocked(getSessionPush).mockResolvedValue({ push: null, question: null });

    const res = fakeRes();

    await handleGetStudySessionPush(res, "ss_1", "g1,,g2", "bogus");

    expect(getSessionPush).toHaveBeenCalledWith(
      "ss_1",
      ["g1", "g2"],
      "socratic",
      expect.any(String),
    );
    expect(res.status).toBe(200);
  });
});

describe("handleGetStudySessionConsistency", () => {
  it.each([
    [null, undefined],
    ["abc", undefined],
    ["0", undefined],
    ["-5", undefined],
    ["30", 30],
    ["365", 365],
    ["100000", 365],
  ])("should read windowDays %s as %s", async (param, expected) => {
    vi.mocked(getConsistency).mockResolvedValue({ planned: 0 } as never);

    const res = fakeRes();

    await handleGetStudySessionConsistency(res, param);

    expect(getConsistency).toHaveBeenCalledWith(expect.any(String), expected);
    expect(res.status).toBe(200);
  });
});
