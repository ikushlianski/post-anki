import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./subject-chat.service.js", () => ({ askSubjectChat: vi.fn() }));

const { askSubjectChat } = await import("./subject-chat.service.js");
const { handleAskSubjectChat } = await import("./subject-chat.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  });

  return readable as unknown as http.IncomingMessage;
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

describe("handleAskSubjectChat", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should answer 200 with the service result for a valid question", async () => {
    const result = { reply: "Answer", usedBits: [{ id: "b1", preview: "p" }], lookupFailed: false, noMatch: false };

    vi.mocked(askSubjectChat).mockResolvedValue(result);
    const res = fakeRes();

    await handleAskSubjectChat(fakeReq({ subjectId: "s1", message: "Why?" }), res);

    expect(askSubjectChat).toHaveBeenCalledWith({ subjectId: "s1", message: "Why?" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
  });

  it("should answer 400 and spend nothing when the message is over the limit", async () => {
    const res = fakeRes();

    await handleAskSubjectChat(fakeReq({ subjectId: "s1", message: "a".repeat(2_001) }), res);

    expect(res.status).toBe(400);
    expect(askSubjectChat).not.toHaveBeenCalled();
  });

  it("should answer 400 when no subject is given", async () => {
    const res = fakeRes();

    await handleAskSubjectChat(fakeReq({ message: "Why?" }), res);

    expect(res.status).toBe(400);
    expect(askSubjectChat).not.toHaveBeenCalled();
  });

  it("should answer 404 when the subject does not exist", async () => {
    vi.mocked(askSubjectChat).mockResolvedValue("subject_not_found");
    const res = fakeRes();

    await handleAskSubjectChat(fakeReq({ subjectId: "missing", message: "Why?" }), res);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });
});
