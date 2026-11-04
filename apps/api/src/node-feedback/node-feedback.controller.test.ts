import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const selectRows = vi.fn();
const insertNodeComment = vi.fn();

vi.mock("../db/client.js", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => selectRows() }) }),
  }),
}));

vi.mock("./node-feedback.repo.js", () => ({
  insertNodeComment: (...args: unknown[]) => insertNodeComment(...args),
}));

const { handleAddModuleComment, handleAddTopicComment } = await import("./node-feedback.controller.js");

function fakeReq(body: string): http.IncomingMessage {
  return Readable.from([Buffer.from(body)]) as unknown as http.IncomingMessage;
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

const handlers = [
  { name: "module", nodeType: "module", handler: handleAddModuleComment },
  { name: "topic", nodeType: "topic", handler: handleAddTopicComment },
] as const;

describe.each(handlers)("handleAdd$name Comment", ({ nodeType, handler }) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and save nothing when the comment is empty", async () => {
    const res = fakeRes();

    await handler(fakeReq(JSON.stringify({ comment: "" })), res, "n1");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(insertNodeComment).not.toHaveBeenCalled();
  });

  it("should answer 400 when the body is not valid JSON", async () => {
    const res = fakeRes();

    await handler(fakeReq("{nope"), res, "n1");

    expect(res.status).toBe(400);
    expect(insertNodeComment).not.toHaveBeenCalled();
  });

  it("should answer 404 and save nothing when the node does not exist", async () => {
    selectRows.mockResolvedValue([]);
    const res = fakeRes();

    await handler(fakeReq(JSON.stringify({ comment: "nice" })), res, "missing");

    expect(res.status).toBe(404);
    expect(insertNodeComment).not.toHaveBeenCalled();
  });

  it("should answer 201 with the saved comment when the node exists", async () => {
    const saved = { id: "nfb_1", nodeType, nodeId: "n1", comment: "nice", createdAt: "2026-01-01T00:00:00.000Z" };

    selectRows.mockResolvedValue([{ id: "n1" }]);
    insertNodeComment.mockResolvedValue(saved);
    const res = fakeRes();

    await handler(fakeReq(JSON.stringify({ comment: "nice" })), res, "n1");

    expect(res.status).toBe(201);
    expect(res.body).toEqual(saved);
    expect(insertNodeComment).toHaveBeenCalledWith(nodeType, "n1", "nice");
  });
});
