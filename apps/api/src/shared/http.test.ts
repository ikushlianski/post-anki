import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import type http from "node:http";
import { z } from "zod";
import { sendJson, sendError, readJsonBody, MAX_BODY_BYTES } from "./http.js";

function mockRes() {
  const res = {
    writeHead: vi.fn(),
    end: vi.fn(),
  };

  return res as unknown as http.ServerResponse & typeof res;
}

function reqFrom(body: string): http.IncomingMessage {
  return Readable.from([Buffer.from(body)]) as unknown as http.IncomingMessage;
}

describe("sendJson", () => {
  it("writes status, json content-type, and serialized body", () => {
    const res = mockRes();
    sendJson(res, 201, { id: "x" });
    expect(res.writeHead).toHaveBeenCalledWith(201, { "content-type": "application/json" });
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ id: "x" }));
  });
});

describe("sendError", () => {
  it("sends just an error when no message", () => {
    const res = mockRes();
    sendError(res, 404, "not_found");
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: "not_found" }));
  });

  it("includes the message when provided", () => {
    const res = mockRes();
    sendError(res, 409, "not_ready", "must confirm first");
    expect(res.end).toHaveBeenCalledWith(
      JSON.stringify({ error: "not_ready", message: "must confirm first" }),
    );
  });
});

describe("readJsonBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("parses and validates a good body", async () => {
    const result = await readJsonBody(reqFrom(JSON.stringify({ name: "ok" })), schema);
    expect(result).toEqual({ ok: true, data: { name: "ok" } });
  });

  it("treats an empty body as an empty object (schema then decides)", async () => {
    const result = await readJsonBody(reqFrom(""), schema);
    expect(result.ok).toBe(false);
  });

  it("rejects invalid JSON", async () => {
    const result = await readJsonBody(reqFrom("{not json"), schema);
    expect(result).toEqual({ ok: false, issues: "body is not valid JSON" });
  });

  it("reports schema issues with field paths", async () => {
    const result = await readJsonBody(reqFrom(JSON.stringify({ name: "" })), schema);
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues).toContain("name");
    }
  });

  it("rejects a body larger than the cap", async () => {
    const huge = JSON.stringify({ name: "x".repeat(MAX_BODY_BYTES + 10) });
    const result = await readJsonBody(reqFrom(huge), schema);
    expect(result).toEqual({ ok: false, issues: "request body too large" });
  });
});
