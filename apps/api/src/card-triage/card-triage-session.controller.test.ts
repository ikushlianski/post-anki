import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  startTriageSession: vi.fn(),
  finishTriageSession: vi.fn(),
  getTriageSessionRow: vi.fn(),
  discardTriageSession: vi.fn(),
  toTriageSessionResponse: vi.fn(),
}));
const distillTriageSession = vi.hoisted(() => vi.fn());

vi.mock("./card-triage-session.repo.js", () => repo);
vi.mock("./card-triage-distill.orchestrator.js", () => ({ distillTriageSession }));

const {
  handleDiscardTriageSession,
  handleFinishTriageSession,
  handleDistillTriageSession,
  handleStartTriageSession,
} = await import(
  "./card-triage-session.controller.js"
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

const row = { id: "cts_1", status: "saved_text_only" };

describe("triage session controller", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repo.toTriageSessionResponse.mockImplementation(async (value: unknown) => value);
  });

  it("should open a session and answer 201", async () => {
    repo.startTriageSession.mockResolvedValue({ session: row, created: true });

    const res = fakeRes();

    await handleStartTriageSession(fakeReq({ subjectId: "subj_1", client: "web", startKey: "k1" }), res);

    expect(repo.startTriageSession).toHaveBeenCalledWith({ subjectId: "subj_1", client: "web", startKey: "k1" });
    expect(res.status).toBe(201);
  });

  it("should answer a retried start with the same session and 200", async () => {
    repo.startTriageSession.mockResolvedValue({ session: row, created: false });

    const res = fakeRes();

    await handleStartTriageSession(fakeReq({ startKey: "k1" }), res);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "cts_1" });
  });

  it("should refuse an unknown client name when starting", async () => {
    const res = fakeRes();

    await handleStartTriageSession(fakeReq({ client: "tv" }), res);

    expect(res.status).toBe(400);
    expect(repo.startTriageSession).not.toHaveBeenCalled();
  });

  it("should refuse feedback over 8000 characters before any model call", async () => {
    const res = fakeRes();

    await handleFinishTriageSession(fakeReq({ feedbackText: "x".repeat(8001) }), res, "cts_1");

    expect(res.status).toBe(400);
    expect(repo.finishTriageSession).not.toHaveBeenCalled();
    expect(distillTriageSession).not.toHaveBeenCalled();
  });

  it("should answer 404 for an unknown session", async () => {
    repo.finishTriageSession.mockResolvedValueOnce({ status: "not_found" });

    const missing = fakeRes();

    await handleFinishTriageSession(fakeReq({}), missing, "cts_x");

    expect(missing.status).toBe(404);
    expect(distillTriageSession).not.toHaveBeenCalled();
  });

  it("should return the stored session with 200 and no second distil when finish is repeated", async () => {
    repo.finishTriageSession.mockResolvedValueOnce({ status: "already_finished", session: row });

    const done = fakeRes();

    await handleFinishTriageSession(fakeReq({}), done, "cts_1");

    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ id: "cts_1" });
    expect(distillTriageSession).not.toHaveBeenCalled();
  });

  it("should record a discard with the undecided count and never distil", async () => {
    repo.discardTriageSession.mockResolvedValue({ status: "ok", session: { ...row, status: "discarded" } });

    const res = fakeRes();

    await handleDiscardTriageSession(fakeReq({ undecidedCount: 3 }), res, "cts_1");

    expect(repo.discardTriageSession).toHaveBeenCalledWith("cts_1", { undecidedCount: 3 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "discarded" });
    expect(distillTriageSession).not.toHaveBeenCalled();
  });

  it("should answer 200 to a repeated discard, 409 when the session was already finished, 404 when unknown", async () => {
    repo.discardTriageSession.mockResolvedValueOnce({ status: "already_finished", session: { ...row, status: "discarded" } });
    repo.discardTriageSession.mockResolvedValueOnce({ status: "already_finished", session: row });
    repo.discardTriageSession.mockResolvedValueOnce({ status: "not_found" });

    const statuses: (number | null)[] = [];

    for (const id of ["a", "b", "c"]) {
      const res = fakeRes();

      await handleDiscardTriageSession(fakeReq({}), res, id);
      statuses.push(res.status);
    }

    expect(statuses).toEqual([200, 409, 404]);
  });

  it("should save the session and distil once when it finishes with text", async () => {
    repo.finishTriageSession.mockResolvedValue({ status: "ok", session: row });
    repo.getTriageSessionRow.mockResolvedValue({ ...row, status: "distilled" });

    const res = fakeRes();

    await handleFinishTriageSession(fakeReq({ feedbackText: "too wordy" }), res, "cts_1");

    expect(distillTriageSession).toHaveBeenCalledWith("cts_1");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "distilled" });
  });

  it("should refuse to distil a session that is still open", async () => {
    repo.getTriageSessionRow.mockResolvedValue({ id: "cts_1", status: "open" });

    const res = fakeRes();

    await handleDistillTriageSession(res, "cts_1");

    expect(res.status).toBe(409);
    expect(distillTriageSession).not.toHaveBeenCalled();
  });

  it("should retry the distil call for a session whose text was saved without notes", async () => {
    repo.getTriageSessionRow.mockResolvedValue(row);

    const res = fakeRes();

    await handleDistillTriageSession(res, "cts_1");

    expect(distillTriageSession).toHaveBeenCalledWith("cts_1");
    expect(res.status).toBe(200);
  });
});
