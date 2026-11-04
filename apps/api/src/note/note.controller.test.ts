import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ found: [] as unknown[] }));
const insertNote = vi.hoisted(() => vi.fn());
const listNotesForNode = vi.hoisted(() => vi.fn());
const searchNotes = vi.hoisted(() => vi.fn());

vi.mock("../db/client.js", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: async () => rows.found }) }) }),
}));
vi.mock("./note.repo.js", () => ({ insertNote, listNotesForNode }));
vi.mock("./note-search.repo.js", () => ({ searchNotes }));

import { handleCaptureNote, handleListNotesForNode, handleSearchNotes } from "./note.controller.js";

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const res = { writeHead: vi.fn(), end: vi.fn() };

  return res as unknown as http.ServerResponse & typeof res;
}

function sent(res: ReturnType<typeof fakeRes>): { status: number; body: unknown } {
  return {
    status: vi.mocked(res.writeHead).mock.calls[0]![0] as number,
    body: JSON.parse(vi.mocked(res.end).mock.calls[0]![0] as string),
  };
}

beforeEach(() => {
  rows.found = [];
  insertNote.mockReset();
  listNotesForNode.mockReset();
  searchNotes.mockReset();
});

describe("handleCaptureNote", () => {
  it("should answer 400 and save nothing for an empty note body", async () => {
    const res = fakeRes();

    await handleCaptureNote(fakeReq({ nodeType: "topic", nodeId: "t1", body: "" }), res);

    expect(sent(res).status).toBe(400);
    expect(insertNote).not.toHaveBeenCalled();
  });

  it("should answer 404 when the target node does not exist", async () => {
    const res = fakeRes();

    await handleCaptureNote(fakeReq({ nodeType: "topic", nodeId: "nope", body: "hi" }), res);

    expect(sent(res)).toEqual({ status: 404, body: { error: "not_found" } });
    expect(insertNote).not.toHaveBeenCalled();
  });

  it("should save the note and answer 201", async () => {
    rows.found = [{ id: "t1" }];
    insertNote.mockResolvedValue({ id: "n1" });
    const res = fakeRes();

    await handleCaptureNote(fakeReq({ nodeType: "topic", nodeId: "t1", body: "hi" }), res);

    expect(insertNote).toHaveBeenCalledWith(expect.objectContaining({ nodeId: "t1", body: "hi", isHighlight: false }));
    expect(sent(res)).toEqual({ status: 201, body: { id: "n1" } });
  });
});

describe("handleListNotesForNode", () => {
  it("should answer 400 when the node type or id is missing", async () => {
    const res = fakeRes();

    await handleListNotesForNode(res, "topic", null);

    expect(sent(res).status).toBe(400);
  });

  it("should list the notes of a node", async () => {
    listNotesForNode.mockResolvedValue([{ id: "n1" }]);
    const res = fakeRes();

    await handleListNotesForNode(res, "topic", "t1");

    expect(sent(res)).toEqual({ status: 200, body: [{ id: "n1" }] });
  });
});

describe("handleSearchNotes", () => {
  it("should answer an empty list for a blank query", async () => {
    const res = fakeRes();

    await handleSearchNotes(res, "  ", null, null);

    expect(sent(res)).toEqual({ status: 200, body: [] });
    expect(searchNotes).not.toHaveBeenCalled();
  });

  it("should answer 400 for an unknown concern", async () => {
    const res = fakeRes();

    await handleSearchNotes(res, "lambda", "bogus", null);

    expect(sent(res)).toEqual({ status: 400, body: { error: "invalid_concern" } });
  });

  it("should search with the normalized query", async () => {
    searchNotes.mockResolvedValue([]);
    const res = fakeRes();

    await handleSearchNotes(res, "lambda", null, null);

    expect(searchNotes).toHaveBeenCalledWith(expect.objectContaining({ query: "lambda" }));
    expect(sent(res).status).toBe(200);
  });
});
