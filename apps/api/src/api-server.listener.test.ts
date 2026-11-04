import { Readable } from "node:stream";
import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import { MAX_BODY_BYTES } from "./shared/http.js";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";
process.env.WEB_ORIGIN = "https://app.example.com";

vi.mock("./db/client.js", () => ({ getDb: () => ({}) }));

const { createApiRequestListener } = await import("./api-server.js");
const { log } = await import("./shared/log.js");

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

interface DispatchExtras {
  body?: string;
  authorization?: string;
}

function dispatch(
  method: string,
  url: string,
  origin?: string,
  extras: DispatchExtras = {},
): Promise<CapturedResponse> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {};
    let status = 0;
    let body = "";
    const finishHandlers: Array<() => void> = [];
    const req = Object.assign(Readable.from(extras.body === undefined ? [] : [Buffer.from(extras.body)]), {
      method,
      url,
      headers: {
        ...(origin ? { origin } : {}),
        ...(extras.authorization ? { authorization: extras.authorization } : {}),
      },
    }) as unknown as http.IncomingMessage;
    const res = {
      headersSent: false,
      statusCode: 200,
      on: (event: string, handler: () => void) => {
        if (event === "finish") finishHandlers.push(handler);
      },
      setHeader: (k: string, v: string) => {
        headers[k.toLowerCase()] = String(v);
      },
      writeHead: (code: number, h?: Record<string, string>) => {
        status = code;
        Object.entries(h ?? {}).forEach(([k, v]) => {
          headers[k.toLowerCase()] = String(v);
        });
      },
      end: (chunk?: string) => {
        body += chunk ?? "";
        (res as { statusCode: number }).statusCode = status;
        finishHandlers.forEach((handler) => handler());
        resolve({ status, headers, body });
      },
    } as unknown as http.ServerResponse;

    createApiRequestListener()(req, res);
  });
}

describe("api request ids", () => {
  it("should put a unique x-request-id header on every response", async () => {
    const first = await dispatch("GET", "/_healthz", "https://app.example.com");
    const second = await dispatch("GET", "/_healthz", "https://app.example.com");

    expect(first.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.headers["x-request-id"]).not.toBe(first.headers["x-request-id"]);
  });

  it("should log one request_done line with the same id, status and duration", async () => {
    const info = vi.spyOn(log, "info");

    const res = await dispatch("GET", "/_healthz", "https://app.example.com");

    const call = info.mock.calls.find((c) => c[1] === "request_done");

    expect(call?.[0]).toMatchObject({
      requestId: res.headers["x-request-id"],
      method: "GET",
      path: "/_healthz",
      status: 200,
    });
    expect(typeof (call?.[0] as { ms: number }).ms).toBe("number");
  });
});

describe("api request listener without a bound port", () => {
  it("should answer the health check with 200 for an allowed origin", async () => {
    const res = await dispatch("GET", "/_healthz", "https://app.example.com");

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
  });

  it("should reject a disallowed origin with 403", async () => {
    const res = await dispatch("GET", "/_healthz", "https://evil.example.com");

    expect(res.status).toBe(403);
  });

  it("should answer a preflight with 204", async () => {
    const res = await dispatch("OPTIONS", "/subjects", "https://app.example.com");

    expect(res.status).toBe(204);
  });
});

describe("api request listener body limit", () => {
  it("should answer 413 for an oversized body on a route outside knowledge sources", async () => {
    const body = JSON.stringify({ comment: "x".repeat(MAX_BODY_BYTES + 10) });

    const res = await dispatch("POST", "/modules/m1/comments", "https://app.example.com", {
      body,
      authorization: "Bearer the-shared-secret",
    });

    expect(res.status).toBe(413);
    expect(JSON.parse(res.body)).toMatchObject({ error: "payload_too_large" });
  });
});
