import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";

const state = vi.hoisted(() => ({
  outcome: { kind: "invalid_credentials" } as unknown,
  calls: [] as { input: unknown; ip: string }[],
}));

vi.mock("../db/client.js", () => ({ getDb: () => ({}) }));
vi.mock("./auth.js", () => ({ CLIENT_IP_HEADER: "x-pa-client-ip", getAuth: vi.fn() }));
vi.mock("./device-token.js", () => ({
  createDeviceToken: vi.fn(async (input: unknown, ip: string) => {
    state.calls.push({ input, ip });

    return state.outcome;
  }),
}));

const { createApiServer } = await import("../api-server.js");

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApiServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  state.calls = [];
  state.outcome = { kind: "invalid_credentials" };
});

function post(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/auth/device-tokens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = { email: "owner@example.com", password: "pw-pw-pw-pw", label: "Mac" };

describe("POST /auth/device-tokens", () => {
  it("should return the new token once with no-store when sign-in succeeds, without any shared secret", async () => {
    state.outcome = { kind: "created", token: "pat_abc", label: "Mac" };

    const res = await post(valid);

    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ token: "pat_abc", label: "Mac" });
  });

  it("should answer a generic Invalid email or password for wrong credentials", async () => {
    const res = await post(valid);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials", message: "Invalid email or password" });
  });

  it("should answer 429 with the retry hint when sign-in is rate limited", async () => {
    state.outcome = { kind: "rate_limited", retryAfter: "30" };

    const res = await post(valid);

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
  });

  it("should reject a body without a label before trying to sign in", async () => {
    const res = await post({ email: valid.email, password: valid.password });

    expect(res.status).toBe(400);
    expect(state.calls).toHaveLength(0);
  });
});
