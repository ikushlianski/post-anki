import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const startProbe = vi.fn();
const submitProbe = vi.fn();

vi.mock("./probe.service.js", () => ({
  startProbe: (...args: unknown[]) => startProbe(...args),
  submitProbe: (...args: unknown[]) => submitProbe(...args),
}));

const { handleStartProbe, handleSubmitProbe } = await import("./probe.controller.js");

const startBody = JSON.stringify({ mode: "socratic" });
const submitBody = JSON.stringify({ gapId: "g1", mode: "quick_test", answer: "42" });

describe("start probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and start nothing when the mode is unknown", async () => {
    const res = fakeRes();

    await handleStartProbe(fakeReq(JSON.stringify({ mode: "weird" })), res, "t1");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(startProbe).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404],
    ["not_confirmed", 409],
    ["gap_not_open", 409],
  ])("should answer %s as %i", async (error, status) => {
    startProbe.mockResolvedValue({ error });
    const res = fakeRes();

    await handleStartProbe(fakeReq(startBody), res, "t1");

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error });
  });

  it("should start the probe for the URL topic and answer 200", async () => {
    startProbe.mockResolvedValue({ question: "Q?" });
    const res = fakeRes();

    await handleStartProbe(fakeReq(startBody), res, "t1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ question: "Q?" });
    expect(startProbe).toHaveBeenCalledWith({ mode: "socratic", topicId: "t1" });
  });
});

describe("submit probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and submit nothing when the answer is missing", async () => {
    const res = fakeRes();

    await handleSubmitProbe(fakeReq(JSON.stringify({ gapId: null, mode: "socratic" })), res, "t1");

    expect(res.status).toBe(400);
    expect(submitProbe).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404],
    ["not_confirmed", 409],
    ["gap_not_open", 409],
  ])("should answer %s as %i", async (error, status) => {
    submitProbe.mockResolvedValue({ error });
    const res = fakeRes();

    await handleSubmitProbe(fakeReq(submitBody), res, "t1");

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error });
  });

  it("should submit against the URL topic with a timestamp and answer 200", async () => {
    submitProbe.mockResolvedValue({ outcome: "pass" });
    const res = fakeRes();

    await handleSubmitProbe(fakeReq(submitBody), res, "t1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ outcome: "pass" });
    expect(submitProbe).toHaveBeenCalledWith(
      { gapId: "g1", mode: "quick_test", answer: "42", topicId: "t1" },
      expect.any(String),
    );
  });
});
