import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const startSocraticSession = vi.fn();
const answerSocraticSession = vi.fn();
const checkSessionIdle = vi.fn();
const completeSessionNow = vi.fn();

vi.mock("./socratic.service.js", () => ({
  startSocraticSession: (...args: unknown[]) => startSocraticSession(...args),
  answerSocraticSession: (...args: unknown[]) => answerSocraticSession(...args),
  checkSessionIdle: (...args: unknown[]) => checkSessionIdle(...args),
  completeSessionNow: (...args: unknown[]) => completeSessionNow(...args),
}));

const {
  handleAnswerSocratic,
  handleCheckSocraticSessionIdle,
  handleCompleteSocraticSession,
  handleStartSocratic,
} = await import("./socratic.controller.js");

const statuses = [
  ["not_found", 404],
  ["not_confirmed", 409],
  ["turn_not_found", 404],
  ["already_answered", 409],
  ["session_completed", 409],
  ["calibration_required", 409],
] as const;

const answerBody = JSON.stringify({ turnId: "t1", answer: "because" });

const routes = [
  {
    name: "start",
    mock: startSocraticSession,
    call: (res: ReturnType<typeof fakeRes>) => handleStartSocratic(fakeReq(JSON.stringify({ topicId: "t1" })), res),
  },
  {
    name: "answer",
    mock: answerSocraticSession,
    call: (res: ReturnType<typeof fakeRes>) => handleAnswerSocratic(fakeReq(answerBody), res, "s1"),
  },
  { name: "idle check", mock: checkSessionIdle, call: (res: ReturnType<typeof fakeRes>) => handleCheckSocraticSessionIdle(res, "s1") },
  { name: "complete", mock: completeSessionNow, call: (res: ReturnType<typeof fakeRes>) => handleCompleteSocraticSession(res, "s1") },
];

describe.each(routes)("socratic $name route", ({ mock, call }) => {
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

describe("socratic request validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should answer 400 and start nothing when topicId is missing", async () => {
    const res = fakeRes();

    await handleStartSocratic(fakeReq("{}"), res);

    expect(res.status).toBe(400);
    expect(startSocraticSession).not.toHaveBeenCalled();
  });

  it("should answer 400 and record nothing when the answer is missing", async () => {
    const res = fakeRes();

    await handleAnswerSocratic(fakeReq(JSON.stringify({ turnId: "t1" })), res, "s1");

    expect(res.status).toBe(400);
    expect(answerSocraticSession).not.toHaveBeenCalled();
  });

  it("should take the session id from the path, not the body", async () => {
    answerSocraticSession.mockResolvedValue({ ok: true });

    await handleAnswerSocratic(fakeReq(answerBody), fakeRes(), "s1");

    expect(answerSocraticSession).toHaveBeenCalledWith(
      { turnId: "t1", answer: "because", sessionId: "s1" },
      expect.any(String),
    );
  });
});
