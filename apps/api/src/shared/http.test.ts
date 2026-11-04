import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import type http from "node:http";
import { z } from "zod";
import { sendJson, sendError, sendInvalidQuery, readJsonBody, BodyTooLargeError, MAX_BODY_BYTES } from "./http.js";

function mockRes() {
  const res = {
    writeHead: vi.fn(),
    end: vi.fn(),
    getHeader: vi.fn(() => undefined as string | undefined),
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
    expect(res.writeHead).toHaveBeenCalledWith(201, {
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    });
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ id: "x" }));
  });

  it("keeps a cache-control header a route already set, such as the public key's max-age", () => {
    const res = mockRes();

    res.getHeader.mockReturnValue("public, max-age=60");
    sendJson(res, 200, { keys: [] });

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
    });
  });
});

describe("sendInvalidQuery", () => {
  it("replies 400 with issues joined into one readable string", () => {
    const res = mockRes();
    const parsed = z.object({ days: z.number(), name: z.string() }).safeParse({ days: "x" });

    if (parsed.success) throw new Error("expected failure");

    sendInvalidQuery(res, parsed.error);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.objectContaining({ "content-type": "application/json" }));
    expect(JSON.parse(vi.mocked(res.end).mock.calls[0]![0] as string)).toEqual({
      error: "invalid_input",
      message: "days: Expected number, received string; name: Required",
    });
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

  it("keeps Cyrillic text intact when a character is split across network chunks", async () => {
    const bytes = Buffer.from(JSON.stringify({ name: "Привет мир" }));
    const cut = bytes.indexOf(0xd0) + 1;
    const req = Readable.from([bytes.subarray(0, cut), bytes.subarray(cut)]) as unknown as http.IncomingMessage;

    const result = await readJsonBody(req, schema);

    expect(result).toEqual({ ok: true, data: { name: "Привет мир" } });
  });

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

  it("throws BodyTooLargeError for a body larger than the cap so every route can answer 413", async () => {
    const huge = JSON.stringify({ name: "x".repeat(MAX_BODY_BYTES + 10) });

    await expect(readJsonBody(reqFrom(huge), schema)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
