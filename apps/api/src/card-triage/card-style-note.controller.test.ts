import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listActiveStyleNotes: vi.fn(),
  listAllActiveStyleNotes: vi.fn(),
  updateCardStyleNote: vi.fn(),
}));

vi.mock("./card-style-note.repo.js", () => repo);

const { handleListCardStyleNotes, handleUpdateCardStyleNote } = await import("./card-style-note.controller.js");

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

describe("card style note controller", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should list only global and the asked subject's notes when a subject is given", async () => {
    repo.listActiveStyleNotes.mockResolvedValue([]);

    const res = fakeRes();

    await handleListCardStyleNotes(res, "?subjectId=subj_a");

    expect(repo.listActiveStyleNotes).toHaveBeenCalledWith("subj_a");
    expect(repo.listAllActiveStyleNotes).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("should list every active note when no subject is given", async () => {
    repo.listAllActiveStyleNotes.mockResolvedValue([]);

    const res = fakeRes();

    await handleListCardStyleNotes(res, "");

    expect(repo.listAllActiveStyleNotes).toHaveBeenCalled();
  });

  it("should refuse an empty update and a note text over 160 characters", async () => {
    const empty = fakeRes();
    const long = fakeRes();

    await handleUpdateCardStyleNote(fakeReq({}), empty, "csn_1");
    await handleUpdateCardStyleNote(fakeReq({ text: "x".repeat(161) }), long, "csn_1");

    expect([empty.status, long.status]).toEqual([400, 400]);
    expect(repo.updateCardStyleNote).not.toHaveBeenCalled();
  });

  it("should switch a note off and answer 404 for an unknown or replaced note", async () => {
    repo.updateCardStyleNote.mockResolvedValueOnce({ id: "csn_1", enabled: false }).mockResolvedValueOnce(null);

    const ok = fakeRes();
    const missing = fakeRes();

    await handleUpdateCardStyleNote(fakeReq({ enabled: false }), ok, "csn_1");
    await handleUpdateCardStyleNote(fakeReq({ enabled: false }), missing, "csn_x");

    expect([ok.status, missing.status]).toEqual([200, 404]);
  });
});
