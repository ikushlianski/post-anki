import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";
process.env.WEB_ORIGIN = "https://app.example.com";
process.env.WEB_ORIGINS = "https://extra.example.com";

vi.mock("./db/client.js", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    orderBy: () => [],
    where: () => chain,
    limit: () => [],
  };

  return { getDb: () => chain };
});

const { createApiServer } = await import("./api-server.js");

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApiServer();

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe("api server origin handling", () => {
  it("should answer a disallowed origin with 403, Vary Origin and no Access-Control-Allow headers", async () => {
    const res = await fetch(`${baseUrl}/_healthz`, { headers: { Origin: "https://evil.example.com" } });

    expect(res.status).toBe(403);
    expect(res.headers.get("vary")).toContain("Origin");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    expect(res.headers.get("access-control-allow-methods")).toBeNull();
  });

  it("should send Vary Origin and no Allow headers when a preflight comes from a disallowed origin", async () => {
    const res = await fetch(`${baseUrl}/subjects`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example.com", "Access-Control-Request-Method": "POST" },
    });

    expect(res.status).toBe(403);
    expect(res.headers.get("vary")).toContain("Origin");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("should still allow the configured web origin and echo exactly that origin with Vary Origin", async () => {
    const res = await fetch(`${baseUrl}/_healthz`, { headers: { Origin: "https://app.example.com" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("vary")).toContain("Origin");
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  });

  it("should still allow an extra configured origin", async () => {
    const res = await fetch(`${baseUrl}/_healthz`, { headers: { Origin: "https://extra.example.com" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://extra.example.com");
  });

  it("should keep answering a request without an Origin header with the web origin and Vary Origin", async () => {
    const res = await fetch(`${baseUrl}/_healthz`);

    expect(res.status).toBe(200);
    expect(res.headers.get("vary")).toContain("Origin");
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  });

  it("should answer a preflight from the allowed origin with 204 and the allowed methods", async () => {
    const res = await fetch(`${baseUrl}/subjects`, {
      method: "OPTIONS",
      headers: { Origin: "https://app.example.com", "Access-Control-Request-Method": "POST" },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
