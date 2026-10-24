import { Readable } from "node:stream";
import type http from "node:http";
import { describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";
process.env.WEB_ORIGIN = "https://app.example.com";

vi.mock("./db/client.js", () => ({ getDb: () => ({}) }));

const { createApiRequestListener } = await import("./api-server.js");

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function dispatch(method: string, url: string, origin?: string): Promise<CapturedResponse> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {};
    let status = 0;
    let body = "";
    const req = Object.assign(Readable.from([]), {
      method,
      url,
      headers: origin ? { origin } : {},
    }) as unknown as http.IncomingMessage;
    const res = {
      headersSent: false,
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
        resolve({ status, headers, body });
      },
    } as unknown as http.ServerResponse;

    createApiRequestListener()(req, res);
  });
}

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
