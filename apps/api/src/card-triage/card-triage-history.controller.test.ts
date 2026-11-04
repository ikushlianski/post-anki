import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const orchestrator = vi.hoisted(() => ({ getRecentTriageHistory: vi.fn() }));
const patchRepo = vi.hoisted(() => ({ patchTriageDecisionDetails: vi.fn() }));
const decisionRepo = vi.hoisted(() => ({ toTriageDecisionResponse: vi.fn((row: unknown) => row) }));
const historyRepo = vi.hoisted(() => ({ findTriageDecisionById: vi.fn() }));
const subjectType = vi.hoisted(() => ({ resolveRejectSubjectType: vi.fn(async () => "programming" as const) }));

vi.mock("./card-triage-history.orchestrator.js", () => orchestrator);
vi.mock("./card-triage-decision-patch.repo.js", () => patchRepo);
vi.mock("./card-triage-decision.repo.js", () => decisionRepo);
vi.mock("./card-triage-history.repo.js", () => historyRepo);
vi.mock("../subject/reject-subject-type.js", () => subjectType);

const { handleListRecentTriageDecisions, handlePatchTriageDecision } = await import(
  "./card-triage-history.controller.js"
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

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

beforeEach(() => {
  vi.clearAllMocks();
  historyRepo.findTriageDecisionById.mockResolvedValue({ id: "ctd_1", verdict: "rejected", subjectId: "s1" });
  patchRepo.patchTriageDecisionDetails.mockResolvedValue({ id: "ctd_1", reasonCode: "too_trivial" });
});

describe("GET /triage-decisions/recent", () => {
  it("should default to seven days, no search text and both search modes", async () => {
    orchestrator.getRecentTriageHistory.mockResolvedValue({ decisions: [] });

    const res = fakeRes();

    await handleListRecentTriageDecisions(res, "");

    expect(res.status).toBe(200);
    expect(orchestrator.getRecentTriageHistory).toHaveBeenCalledWith({ days: 7, q: "", mode: "both" });
  });

  it("should pass the search text and mode through", async () => {
    orchestrator.getRecentTriageHistory.mockResolvedValue({ decisions: [] });

    await handleListRecentTriageDecisions(fakeRes(), "?q=ttl&mode=meaning&days=3");

    expect(orchestrator.getRecentTriageHistory).toHaveBeenCalledWith({ days: 3, q: "ttl", mode: "meaning" });
  });

  it("should reject an unknown search mode", async () => {
    const res = fakeRes();

    await handleListRecentTriageDecisions(res, "?mode=fuzzy");

    expect(res.status).toBe(400);
  });
});

describe("PATCH /triage-decisions/:id", () => {
  it("should set the reason on a rejected decision from any session", async () => {
    const res = fakeRes();

    await handlePatchTriageDecision(fakeReq({ reasonCode: "too_trivial" }), res, "ctd_1");

    expect(res.status).toBe(200);
    expect(patchRepo.patchTriageDecisionDetails).toHaveBeenCalledWith("ctd_1", { reasonCode: "too_trivial" });
  });

  it("should allow clearing the reason", async () => {
    const res = fakeRes();

    await handlePatchTriageDecision(fakeReq({ reasonCode: null }), res, "ctd_1");

    expect(res.status).toBe(200);
  });

  it("should refuse a reason on an accepted decision", async () => {
    historyRepo.findTriageDecisionById.mockResolvedValue({ id: "ctd_1", verdict: "approved", subjectId: null });

    const res = fakeRes();

    await handlePatchTriageDecision(fakeReq({ reasonCode: "too_trivial" }), res, "ctd_1");

    expect(res.status).toBe(400);
    expect(patchRepo.patchTriageDecisionDetails).not.toHaveBeenCalled();
  });

  it("should answer not found for an unknown decision", async () => {
    historyRepo.findTriageDecisionById.mockResolvedValue(null);

    const res = fakeRes();

    await handlePatchTriageDecision(fakeReq({ reasonCode: null }), res, "ctd_x");

    expect(res.status).toBe(404);
  });

  it("should refuse an empty patch", async () => {
    const res = fakeRes();

    await handlePatchTriageDecision(fakeReq({}), res, "ctd_1");

    expect(res.status).toBe(400);
  });
});
