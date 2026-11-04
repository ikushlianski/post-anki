import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const submitDecideSession = vi.fn();
const listDecideSessions = vi.fn();
const updateDecideBlindSpotStatus = vi.fn();

vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

vi.mock("./decide.orchestrator.js", () => ({
  submitDecideSession: (...args: unknown[]) => submitDecideSession(...args),
}));

vi.mock("./decide.repo.js", () => ({
  listDecideSessions: (...args: unknown[]) => listDecideSessions(...args),
  updateDecideBlindSpotStatus: (...args: unknown[]) => updateDecideBlindSpotStatus(...args),
}));

const { handleCreateDecideSession, handleResolveDecideBlindSpot } = await import(
  "./decide.controller.js"
);

const validBody = JSON.stringify({ decision: "Use Postgres", opinion: "It fits" });

describe("create a decide session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and evaluate nothing when the opinion is empty", async () => {
    const res = fakeRes();

    await handleCreateDecideSession(fakeReq(JSON.stringify({ decision: "x", opinion: " " })), res);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(submitDecideSession).not.toHaveBeenCalled();
  });

  it("should answer 502 evaluator_unavailable and return no session when evaluation fails", async () => {
    submitDecideSession.mockRejectedValue(new Error("agent down"));
    const res = fakeRes();

    await handleCreateDecideSession(fakeReq(validBody), res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("evaluator_unavailable");
    expect(res.body).not.toHaveProperty("id");
  });

  it("should answer 200 with the session and pass the trimmed decision and opinion", async () => {
    submitDecideSession.mockResolvedValue({ id: "d1", blindSpots: [] });
    const res = fakeRes();

    await handleCreateDecideSession(fakeReq(validBody), res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "d1", blindSpots: [] });
    expect(submitDecideSession).toHaveBeenCalledWith("Use Postgres", "It fits");
  });
});

describe("resolve a decide blind spot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and update nothing when the status is unknown", async () => {
    const res = fakeRes();

    await handleResolveDecideBlindSpot(fakeReq(JSON.stringify({ status: "maybe" })), res, "b1");

    expect(res.status).toBe(400);
    expect(updateDecideBlindSpotStatus).not.toHaveBeenCalled();
  });

  it("should answer 404 when the blind spot does not exist", async () => {
    updateDecideBlindSpotStatus.mockResolvedValue(null);
    const res = fakeRes();

    await handleResolveDecideBlindSpot(fakeReq(JSON.stringify({ status: "accepted" })), res, "missing");

    expect(res.status).toBe(404);
  });

  it("should answer 200 with the updated blind spot", async () => {
    updateDecideBlindSpotStatus.mockResolvedValue({ id: "b1", status: "rejected" });
    const res = fakeRes();

    await handleResolveDecideBlindSpot(fakeReq(JSON.stringify({ status: "rejected" })), res, "b1");

    expect(res.status).toBe(200);
    expect(updateDecideBlindSpotStatus).toHaveBeenCalledWith("b1", "rejected");
  });
});
