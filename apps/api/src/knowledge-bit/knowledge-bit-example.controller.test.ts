import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./knowledge-bit-example.service.js", () => ({ generateKnowledgeBitExample: vi.fn() }));

import { generateKnowledgeBitExample } from "./knowledge-bit-example.service.js";
import { handleGenerateKnowledgeBitExample } from "./knowledge-bit-example.controller.js";

function fakeReq(raw: string): http.IncomingMessage {
  return Readable.from([raw]) as unknown as http.IncomingMessage;
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

describe("handleGenerateKnowledgeBitExample", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should accept an empty body as overwrite false and return the result", async () => {
    const result = {
      knowledgeBitId: "kb_1",
      example: "E",
      exampleAiGeneratedAt: "2026-10-28T10:00:00.000Z",
      previousExample: null,
      generationsLeft: 4,
    };

    vi.mocked(generateKnowledgeBitExample).mockResolvedValue(result);

    const res = fakeRes();

    await handleGenerateKnowledgeBitExample(fakeReq(""), res, "kb_1");

    expect(generateKnowledgeBitExample).toHaveBeenCalledWith("kb_1", false);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
  });

  it("should pass overwrite true through", async () => {
    vi.mocked(generateKnowledgeBitExample).mockResolvedValue({ error: "blocked" });

    await handleGenerateKnowledgeBitExample(fakeReq('{"overwrite":true}'), fakeRes(), "kb_1");

    expect(generateKnowledgeBitExample).toHaveBeenCalledWith("kb_1", true);
  });

  it.each([
    ["not_found", 404],
    ["blocked", 409],
    ["example_exists", 409],
    ["limit_reached", 409],
    ["generation_failed", 502],
    ["budget_exceeded", 503],
  ] as const)("should map %s to status %i", async (error, status) => {
    vi.mocked(generateKnowledgeBitExample).mockResolvedValue({ error });

    const res = fakeRes();

    await handleGenerateKnowledgeBitExample(fakeReq(""), res, "kb_1");

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error });
  });

  it("should reject an invalid body with 400", async () => {
    const res = fakeRes();

    await handleGenerateKnowledgeBitExample(fakeReq('{"overwrite":"yes"}'), res, "kb_1");

    expect(res.status).toBe(400);
    expect(generateKnowledgeBitExample).not.toHaveBeenCalled();
  });
});
