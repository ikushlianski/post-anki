import type http from "node:http";
import { describe, expect, it, vi } from "vitest";

vi.mock("./knowledge-bit-rejected.repo.js", () => ({
  listRejectedKnowledgeBits: vi.fn(async () => ({ items: [], hasMore: false })),
  restoreRejectedOnly: vi.fn(),
}));

import { handleListRejectedKnowledgeBits, handleRestoreRejectedOnly } from "./knowledge-bit-rejected.controller.js";
import { listRejectedKnowledgeBits, restoreRejectedOnly } from "./knowledge-bit-rejected.repo.js";

function fakeResponse() {
  const res = { statusCode: 0, body: "", writeHead: vi.fn(), end: vi.fn() };

  res.writeHead.mockImplementation((status: number) => {
    res.statusCode = status;
  });
  res.end.mockImplementation((body: string) => {
    res.body = body;
  });

  return res;
}

describe("handleListRejectedKnowledgeBits", () => {
  it("should answer 400 and not query when the reason is unknown", async () => {
    const res = fakeResponse();

    await handleListRejectedKnowledgeBits(res as unknown as http.ServerResponse, "?reason=nope");

    expect(res.statusCode).toBe(400);
    expect(listRejectedKnowledgeBits).not.toHaveBeenCalled();
  });

  it("should pass a known reason and paging to the query", async () => {
    const res = fakeResponse();

    await handleListRejectedKnowledgeBits(res as unknown as http.ServerResponse, "?reason=bad_format&limit=10");

    expect(res.statusCode).toBe(200);
    expect(listRejectedKnowledgeBits).toHaveBeenCalledWith({ reason: "bad_format", limit: 10, offset: 0 });
  });
});

describe("handleListRejectedKnowledgeBits text search", () => {
  it("should pass a trimmed search text together with the reason", async () => {
    const res = fakeResponse();

    await handleListRejectedKnowledgeBits(res as unknown as http.ServerResponse, "?q=%20tcp%20&reason=other");

    expect(res.statusCode).toBe(200);
    expect(listRejectedKnowledgeBits).toHaveBeenLastCalledWith({ q: "tcp", reason: "other", limit: 50, offset: 0 });
  });

  it("should ignore a blank search text", async () => {
    const res = fakeResponse();

    await handleListRejectedKnowledgeBits(res as unknown as http.ServerResponse, "?q=%20%20");

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(listRejectedKnowledgeBits).mock.lastCall?.[0].q).toBeUndefined();
  });

  it("should answer 400 and not query when the search text is longer than 200 characters", async () => {
    vi.mocked(listRejectedKnowledgeBits).mockClear();
    const res = fakeResponse();

    await handleListRejectedKnowledgeBits(res as unknown as http.ServerResponse, `?q=${"a".repeat(201)}`);

    expect(res.statusCode).toBe(400);
    expect(listRejectedKnowledgeBits).not.toHaveBeenCalled();
  });
});

describe("handleRestoreRejectedOnly", () => {
  it.each([
    ["ok", 200],
    ["not_found", 404],
    ["not_rejected", 409],
  ] as const)("should answer %s with status %i", async (result, status) => {
    vi.mocked(restoreRejectedOnly).mockResolvedValue(result);

    const res = fakeResponse();

    await handleRestoreRejectedOnly(res as unknown as http.ServerResponse, "kb_1");

    expect(restoreRejectedOnly).toHaveBeenCalledWith("kb_1");
    expect(res.statusCode).toBe(status);
  });
});

describe("handleListRejectedKnowledgeBits subject filter", () => {
  it("should pass the subject together with reason and text", async () => {
    const res = fakeResponse();

    await handleListRejectedKnowledgeBits(res as unknown as http.ServerResponse, "?subjectId=sub-1&reason=other&q=tcp");

    expect(res.statusCode).toBe(200);
    expect(listRejectedKnowledgeBits).toHaveBeenLastCalledWith({
      subjectId: "sub-1",
      reason: "other",
      q: "tcp",
      limit: 50,
      offset: 0,
    });
  });

  it("should answer 400 for an empty subject", async () => {
    const res = fakeResponse();

    await handleListRejectedKnowledgeBits(res as unknown as http.ServerResponse, "?subjectId=");

    expect(res.statusCode).toBe(400);
  });
});
