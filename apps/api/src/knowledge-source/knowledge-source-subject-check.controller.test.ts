import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./knowledge-source-subject-check.orchestrator.js", () => ({ runSubjectCheck: vi.fn() }));

import { handleCreateKnowledgeSourceSubjectCheck } from "./knowledge-source-subject-check.controller.js";
import { runSubjectCheck } from "./knowledge-source-subject-check.orchestrator.js";

function requestOf(body: unknown): http.IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as http.IncomingMessage;
}

function responseStub(): { res: http.ServerResponse; status: () => number; body: () => unknown } {
  let status = 0;
  let payload = "";
  const res = {
    writeHead: (code: number) => {
      status = code;
    },
    end: (chunk: string) => {
      payload = chunk;
    },
  } as unknown as http.ServerResponse;

  return { res, status: () => status, body: () => JSON.parse(payload) };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("handleCreateKnowledgeSourceSubjectCheck", () => {
  it("should return the advice for a valid request", async () => {
    vi.mocked(runSubjectCheck).mockResolvedValue({ status: "none" });
    const out = responseStub();

    await handleCreateKnowledgeSourceSubjectCheck(requestOf({ blocks: [{ type: "text", value: "hello" }] }), out.res);

    expect(out.status()).toBe(200);
    expect(out.body()).toEqual({ status: "none" });
  });

  it("should reject a request with no blocks before spending anything", async () => {
    const out = responseStub();

    await handleCreateKnowledgeSourceSubjectCheck(requestOf({ blocks: [] }), out.res);

    expect(out.status()).toBe(400);
    expect(runSubjectCheck).not.toHaveBeenCalled();
  });

  it("should reject more than five blocks", async () => {
    const out = responseStub();
    const blocks = Array.from({ length: 6 }, () => ({ type: "text", value: "x" }));

    await handleCreateKnowledgeSourceSubjectCheck(requestOf({ blocks }), out.res);

    expect(out.status()).toBe(400);
  });

  it("should answer unavailable instead of an error when the check throws", async () => {
    vi.mocked(runSubjectCheck).mockRejectedValue(new Error("boom"));
    const out = responseStub();

    await handleCreateKnowledgeSourceSubjectCheck(requestOf({ blocks: [{ type: "text", value: "hello" }] }), out.res);

    expect(out.status()).toBe(200);
    expect(out.body()).toEqual({ status: "unavailable", reason: "failed" });
  });
});
