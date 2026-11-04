import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const prepareProbeSession = vi.fn();
const answerProbeSession = vi.fn();
const getActiveProbeSession = vi.fn();

vi.mock("./probe-session.service.js", () => ({
  prepareProbeSession: (...args: unknown[]) => prepareProbeSession(...args),
  answerProbeSession: (...args: unknown[]) => answerProbeSession(...args),
  getActiveProbeSession: (...args: unknown[]) => getActiveProbeSession(...args),
}));

const { handleActiveProbeSession, handleAnswerProbeSession, handlePrepareProbeSession } = await import(
  "./probe-session.controller.js"
);

const statuses = [
  ["not_found", 404],
  ["not_confirmed", 409],
  ["generation_failed", 502],
  ["question_not_found", 404],
  ["invalid_target_count", 400],
  ["session_completed", 409],
] as const;

const prepareBody = JSON.stringify({ scope: "topic", scopeId: "t1" });
const answerBody = JSON.stringify({ questionId: "q1", selectedIndex: 1 });

const routes = [
  { name: "prepare", mock: prepareProbeSession, call: (res: ReturnType<typeof fakeRes>) => handlePrepareProbeSession(fakeReq(prepareBody), res) },
  { name: "answer", mock: answerProbeSession, call: (res: ReturnType<typeof fakeRes>) => handleAnswerProbeSession(fakeReq(answerBody), res, "s1") },
];

describe.each(routes)("probe session $name route", ({ mock, call }) => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(statuses)("should map the %s service error to %i", async (error, status) => {
    mock.mockResolvedValue({ error });
    const res = fakeRes();

    await call(res);

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error });
  });

  it("should answer 200 with the service result on success", async () => {
    mock.mockResolvedValue({ sessionId: "s1" });
    const res = fakeRes();

    await call(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sessionId: "s1" });
  });
});

describe("probe session request validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should answer 400 and prepare nothing for an unknown scope", async () => {
    const res = fakeRes();

    await handlePrepareProbeSession(fakeReq(JSON.stringify({ scope: "galaxy", scopeId: "t1" })), res);

    expect(res.status).toBe(400);
    expect(prepareProbeSession).not.toHaveBeenCalled();
  });

  it("should answer 400 and record nothing when the question id is missing", async () => {
    const res = fakeRes();

    await handleAnswerProbeSession(fakeReq("{}"), res, "s1");

    expect(res.status).toBe(400);
    expect(answerProbeSession).not.toHaveBeenCalled();
  });

  it("should take the session id from the path, not the body", async () => {
    answerProbeSession.mockResolvedValue({ ok: true });

    await handleAnswerProbeSession(fakeReq(answerBody), fakeRes(), "s1");

    expect(answerProbeSession).toHaveBeenCalledWith(
      { questionId: "q1", selectedIndex: 1, sessionId: "s1" },
      expect.any(String),
    );
  });
});

describe("active probe session query", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should answer 400 for an unknown scope", async () => {
    const res = fakeRes();

    await handleActiveProbeSession(res, "galaxy", "t1", null);

    expect(res.status).toBe(400);
    expect(getActiveProbeSession).not.toHaveBeenCalled();
  });

  it("should answer 400 when the scope is missing", async () => {
    const res = fakeRes();

    await handleActiveProbeSession(res, null, "t1", null);

    expect(res.status).toBe(400);
  });

  it("should answer 400 when the scope id is missing", async () => {
    const res = fakeRes();

    await handleActiveProbeSession(res, "topic", null, null);

    expect(res.status).toBe(400);
  });

  it("should answer 400 for a mode that is neither practice nor exam", async () => {
    const res = fakeRes();

    await handleActiveProbeSession(res, "topic", "t1", "blitz");

    expect(res.status).toBe(400);
    expect(getActiveProbeSession).not.toHaveBeenCalled();
  });

  it("should look up the practice session when no mode is sent", async () => {
    getActiveProbeSession.mockResolvedValue(null);
    const res = fakeRes();

    await handleActiveProbeSession(res, "topic", "t1", null);

    expect(res.status).toBe(200);
    expect(getActiveProbeSession).toHaveBeenCalledWith("topic", "t1", "practice");
  });

  it("should look up the exam session when mode is exam", async () => {
    getActiveProbeSession.mockResolvedValue({ id: "s1" });
    const res = fakeRes();

    await handleActiveProbeSession(res, "topic", "t1", "exam");

    expect(res.body).toEqual({ id: "s1" });
    expect(getActiveProbeSession).toHaveBeenCalledWith("topic", "t1", "exam");
  });
});
