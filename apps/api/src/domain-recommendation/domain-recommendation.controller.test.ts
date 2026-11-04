import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const triggerDomainRecommendations = vi.fn();
const resolveDomainRecommendation = vi.fn();
const listRecommendationsForSubject = vi.fn();

vi.mock("./domain-recommendation.orchestrator.js", () => ({
  triggerDomainRecommendations: (...args: unknown[]) => triggerDomainRecommendations(...args),
  resolveDomainRecommendation: (...args: unknown[]) => resolveDomainRecommendation(...args),
}));

vi.mock("./domain-recommendation.repo.js", () => ({
  listRecommendationsForSubject: (...args: unknown[]) => listRecommendationsForSubject(...args),
}));

const {
  handleTriggerDomainRecommendations,
  handleListDomainRecommendations,
  handleResolveDomainRecommendation,
} = await import("./domain-recommendation.controller.js");

describe("trigger domain recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["no_domain_nodes", "not_taxonomy_backed"])("should answer 404 when %s", async (error) => {
    triggerDomainRecommendations.mockResolvedValue({ error });
    const res = fakeRes();

    await handleTriggerDomainRecommendations(res, "s1");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error });
  });

  it("should answer 200 with the created recommendations", async () => {
    triggerDomainRecommendations.mockResolvedValue([{ id: "r1" }]);
    const res = fakeRes();

    await handleTriggerDomainRecommendations(res, "s1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "r1" }]);
    expect(triggerDomainRecommendations).toHaveBeenCalledWith("s1");
  });
});

describe("list domain recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and list nothing for an unknown status filter", async () => {
    const res = fakeRes();

    await handleListDomainRecommendations(res, "s1", "bogus");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(listRecommendationsForSubject).not.toHaveBeenCalled();
  });

  it("should filter by a valid status and answer 200", async () => {
    listRecommendationsForSubject.mockResolvedValue([{ id: "r1" }]);
    const res = fakeRes();

    await handleListDomainRecommendations(res, "s1", "pending");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "r1" }]);
    expect(listRecommendationsForSubject).toHaveBeenCalledWith("s1", "pending");
  });

  it("should list all statuses when no filter is given", async () => {
    listRecommendationsForSubject.mockResolvedValue([]);
    const res = fakeRes();

    await handleListDomainRecommendations(res, "s1", null);

    expect(res.status).toBe(200);
    expect(listRecommendationsForSubject).toHaveBeenCalledWith("s1", undefined);
  });
});

describe("resolve domain recommendation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and resolve nothing when the status is not accepted or rejected", async () => {
    const res = fakeRes();

    await handleResolveDomainRecommendation(fakeReq(JSON.stringify({ status: "pending" })), res, "r1");

    expect(res.status).toBe(400);
    expect(resolveDomainRecommendation).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404, "not_found"],
    ["subject_not_found", 404, "subject_not_found"],
    ["already_resolved", 409, "already_resolved"],
  ])("should answer %s as %i", async (error, status, body) => {
    resolveDomainRecommendation.mockResolvedValue({ error });
    const res = fakeRes();

    await handleResolveDomainRecommendation(fakeReq(JSON.stringify({ status: "accepted" })), res, "r1");

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: body });
  });

  it("should answer 200 with the updated recommendation", async () => {
    resolveDomainRecommendation.mockResolvedValue({ id: "r1", status: "rejected" });
    const res = fakeRes();

    await handleResolveDomainRecommendation(fakeReq(JSON.stringify({ status: "rejected" })), res, "r1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "r1", status: "rejected" });
    expect(resolveDomainRecommendation).toHaveBeenCalledWith("r1", "rejected");
  });
});
