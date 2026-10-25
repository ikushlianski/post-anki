import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  putTriageDecision: vi.fn(),
  undoTriageDecision: vi.fn(),
  getLiveTriageDecision: vi.fn(),
  listTriageDecisions: vi.fn(),
  toTriageDecisionResponse: vi.fn(),
}));
const sessionRepo = vi.hoisted(() => ({ getTriageSessionRow: vi.fn() }));

vi.mock("./card-triage-decision.repo.js", () => repo);
vi.mock("./card-triage-session.repo.js", () => sessionRepo);

const { handleDeleteTriageDecision, handleGetTriageDecision, handleListTriageDecisions, handlePutTriageDecision } =
  await import("./card-triage-decision.controller.js");

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

const decision = { id: "ctd_1", verdict: "rejected" };

describe("triage decision controller", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repo.toTriageDecisionResponse.mockImplementation((value: unknown) => value);
  });

  it("should store a rejected card with its reason and note and answer 200", async () => {
    repo.putTriageDecision.mockResolvedValue({ status: "ok", decision });

    const res = fakeRes();

    await handlePutTriageDecision(fakeReq({ verdict: "rejected", reasonCode: "bad_format", note: "odd" }), res, "cts_1", "kb_1");

    expect(repo.putTriageDecision).toHaveBeenCalledWith("cts_1", "kb_1", {
      verdict: "rejected",
      reasonCode: "bad_format",
      note: "odd",
    });
    expect(res.status).toBe(200);
  });

  it("should refuse a reject reason on an accepted card with 400 before touching the record", async () => {
    const res = fakeRes();

    await handlePutTriageDecision(fakeReq({ verdict: "approved", reasonCode: "other" }), res, "cts_1", "kb_1");

    expect(res.status).toBe(400);
    expect(repo.putTriageDecision).not.toHaveBeenCalled();
  });

  it("should map missing session or card to 404 and finished session or unapplied card to 409", async () => {
    const outcomes = [
      "session_not_found",
      "bit_not_found",
      "session_finished",
      "decision_not_applied",
    ] as const;
    const statuses: (number | null)[] = [];

    for (const status of outcomes) {
      repo.putTriageDecision.mockResolvedValueOnce({ status });

      const res = fakeRes();

      await handlePutTriageDecision(fakeReq({ verdict: "approved" }), res, "cts_1", "kb_1");
      statuses.push(res.status);
    }

    expect(statuses).toEqual([404, 404, 409, 409]);
  });

  it("should undo a decision with 200 and map the failure cases", async () => {
    const outcomes: { status: string; decision?: unknown }[] = [
      { status: "ok", decision },
      { status: "session_not_found" },
      { status: "decision_not_found" },
      { status: "session_finished" },
    ];
    const statuses: (number | null)[] = [];

    for (const outcome of outcomes) {
      repo.undoTriageDecision.mockResolvedValueOnce(outcome);

      const res = fakeRes();

      await handleDeleteTriageDecision(res, "cts_1", "kb_1");
      statuses.push(res.status);
    }

    expect(statuses).toEqual([200, 404, 404, 409]);
  });

  it("should answer 404 when no live decision exists for the card", async () => {
    repo.getLiveTriageDecision.mockResolvedValue(null);

    const res = fakeRes();

    await handleGetTriageDecision(res, "cts_1", "kb_1");

    expect(res.status).toBe(404);
  });

  it("should list the decisions of a known session and 404 for an unknown one", async () => {
    sessionRepo.getTriageSessionRow.mockResolvedValueOnce(null);

    const missing = fakeRes();

    await handleListTriageDecisions(missing, "cts_x");
    sessionRepo.getTriageSessionRow.mockResolvedValueOnce({ id: "cts_1" });
    repo.listTriageDecisions.mockResolvedValue([decision]);

    const ok = fakeRes();

    await handleListTriageDecisions(ok, "cts_1", "?includeUndone=1");

    expect(missing.status).toBe(404);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ decisions: [decision] });
    expect(repo.listTriageDecisions).toHaveBeenCalledWith("cts_1", { includeUndone: true });
  });
});
