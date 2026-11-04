import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tag.service.js", () => ({
  addTagAssignment: vi.fn(),
  createOrGetTag: vi.fn(),
  deleteExistingTag: vi.fn(),
  deleteTagAssignment: vi.fn(),
  getAllTagMasteryStatuses: vi.fn(),
  getAllTags: vi.fn(),
  mergeTagsService: vi.fn(),
  renameExistingTag: vi.fn(),
}));

const { deleteExistingTag, renameExistingTag } = await import("./tag.service.js");
const { handleDeleteTag, handleRenameTag } = await import("./tag.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleRenameTag", () => {
  it("should refuse a blank or over-long name with 400", async () => {
    const blank = fakeRes();
    const long = fakeRes();

    await handleRenameTag(fakeReq({ name: "   " }), blank, "t1");
    await handleRenameTag(fakeReq({ name: "x".repeat(121) }), long, "t1");

    expect(blank.status).toBe(400);
    expect(long.status).toBe(400);
    expect(renameExistingTag).not.toHaveBeenCalled();
  });

  it("should pass the trimmed name and answer 200 with the renamed tag", async () => {
    const tag = { id: "t1", name: "React", normalizedName: "react" };

    vi.mocked(renameExistingTag).mockResolvedValue(tag);

    const res = fakeRes();

    await handleRenameTag(fakeReq({ name: "  React  " }), res, "t1");

    expect(renameExistingTag).toHaveBeenCalledWith("t1", "React");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(tag);
  });

  it("should answer 404 for an unknown tag", async () => {
    vi.mocked(renameExistingTag).mockResolvedValue({ error: "not_found" });

    const res = fakeRes();

    await handleRenameTag(fakeReq({ name: "x" }), res, "nope");

    expect(res.status).toBe(404);
  });

  it("should answer 409 when another tag already has the name", async () => {
    vi.mocked(renameExistingTag).mockResolvedValue({ error: "name_taken" });

    const res = fakeRes();

    await handleRenameTag(fakeReq({ name: "taken" }), res, "t1");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "name_taken" });
  });
});

describe("handleDeleteTag", () => {
  it("should answer 200 when the tag is deleted", async () => {
    vi.mocked(deleteExistingTag).mockResolvedValue(true);

    const res = fakeRes();

    await handleDeleteTag(res, "t1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("should answer 404 for an unknown tag", async () => {
    vi.mocked(deleteExistingTag).mockResolvedValue(false);

    const res = fakeRes();

    await handleDeleteTag(res, "nope");

    expect(res.status).toBe(404);
  });
});
