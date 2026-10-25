import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";

const SECRET = "the-shared-secret";
const WEB_ORIGIN = "https://postanki.example.com";

const state = vi.hoisted(() => ({
  secret: "the-shared-secret" as string | undefined,
  nodeEnv: undefined as string | undefined,
  tokenRows: [] as { id: string; tokenHash: string; revokedAt: Date | null }[],
  seen: [] as { url: string; body: string; clientIp: string | null }[],
  validSessionHeaders: [] as string[],
}));

vi.mock("../db/client.js", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => state.tokenRows,
  };

  return { getDb: () => chain };
});

vi.mock("../shared/env.js", async () => {
  const actual = await vi.importActual<typeof import("../shared/env.js")>("../shared/env.js");

  return {
    ...actual,
    loadEnv: () => ({
      ...actual.loadEnv(),
      API_SHARED_SECRET: state.secret,
      NODE_ENV: state.nodeEnv,
      WEB_ORIGINS: WEB_ORIGIN,
    }),
  };
});

vi.mock("../api-token/api-token.repo.js", async () => {
  const actual = await vi.importActual<typeof import("../api-token/api-token.repo.js")>(
    "../api-token/api-token.repo.js",
  );

  return { ...actual, touchLastUsed: vi.fn(async () => undefined) };
});

vi.mock("./auth-status.js", () => ({ checkWebSession: vi.fn(async () => "signed_out") }));

vi.mock("./auth.js", () => ({
  CLIENT_IP_HEADER: "x-pa-client-ip",
  getAuth: () => ({
    api: {
      getSession: async ({ headers }: { headers: Headers }) =>
        state.validSessionHeaders.includes(headers.get("authorization") ?? "") ? { session: { id: "s" } } : null,
    },
    handler: async (request: Request) => {
      state.seen.push({ url: request.url, body: await request.text(), clientIp: request.headers.get("x-pa-client-ip") });

      const headers = new Headers({ "content-type": "application/json" });

      headers.append("set-cookie", "session_token=abc; HttpOnly; Path=/");
      headers.append("set-cookie", "session_data=def; HttpOnly; Path=/");

      return new Response('{"status":true}', { status: 200, headers });
    },
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
  state.secret = SECRET;
  state.nodeEnv = undefined;
  state.tokenRows = [];
  state.seen = [];
  state.validSessionHeaders = [];
});

function signIn(headers: Record<string, string>): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ email: "owner@example.com" }),
  });
}

describe("web auth routes", () => {
  it("should refuse the sign-in endpoints without the shared secret", async () => {
    expect((await signIn({})).status).toBe(401);
  });

  it("should reach the auth handler when the browser origin is the public web origin and the secret is sent", async () => {
    const res = await signIn({ authorization: `Bearer ${SECRET}`, origin: WEB_ORIGIN });

    expect(res.status).toBe(200);
    expect(state.seen).toHaveLength(1);
  });

  it("should reject a browser origin the API does not list", async () => {
    const res = await signIn({ authorization: `Bearer ${SECRET}`, origin: "https://evil.example.com" });

    expect(res.status).toBe(403);
    expect(state.seen).toHaveLength(0);
  });

  it("should pass the request body in and the response body and every Set-Cookie back out", async () => {
    const res = await signIn({ authorization: `Bearer ${SECRET}` });

    expect(await res.json()).toEqual({ status: true });
    expect(JSON.parse(state.seen[0]?.body ?? "{}")).toEqual({ email: "owner@example.com" });
    expect(res.headers.getSetCookie()).toEqual([
      "session_token=abc; HttpOnly; Path=/",
      "session_data=def; HttpOnly; Path=/",
    ]);
  });

  it("should refuse a personal api token on the sign-in endpoints", async () => {
    state.tokenRows = [{ id: "apitoken_phone", tokenHash: "x", revokedAt: null }];

    expect((await signIn({ authorization: "Bearer pat_phone" })).status).toBe(401);
    expect(state.seen).toHaveLength(0);
  });

  it("should still accept a personal api token on an ordinary route", async () => {
    state.tokenRows = [{ id: "apitoken_phone", tokenHash: "x", revokedAt: null }];

    const res = await fetch(`${baseUrl}/sync-tokens`, { method: "POST", headers: { authorization: "Bearer pat_phone" } });

    expect(res.status).not.toBe(401);
  });

  it("should answer 401 on the auth endpoints in production when no shared secret is configured", async () => {
    state.secret = undefined;
    state.nodeEnv = "production";

    expect((await signIn({})).status).toBe(401);
  });

  it("should refuse the session check without the shared secret and refuse a personal api token", async () => {
    state.tokenRows = [{ id: "apitoken_phone", tokenHash: "x", revokedAt: null }];

    expect((await fetch(`${baseUrl}/web-auth/checks`, { method: "POST", body: "{}" })).status).toBe(401);
    expect(
      (await fetch(`${baseUrl}/web-auth/checks`, { method: "POST", body: "{}", headers: { authorization: "Bearer pat_phone" } })).status,
    ).toBe(401);
  });

  it("should answer the session check when the shared secret is sent", async () => {
    const res = await fetch(`${baseUrl}/web-auth/checks`, {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
      body: "{}",
    });

    expect(await res.json()).toEqual({ state: "signed_out" });
  });

  it("should reach the auth handler for native password sign-in, sign-out and session lookup without the shared secret", async () => {
    const signInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, { method: "POST", body: "{}" });
    const signOutRes = await fetch(`${baseUrl}/api/auth/sign-out`, { method: "POST", body: "{}" });
    const sessionRes = await fetch(`${baseUrl}/api/auth/get-session`);

    expect([signInRes.status, signOutRes.status, sessionRes.status]).toEqual([200, 200, 200]);
    expect(state.seen).toHaveLength(3);
  });

  it("should ignore a client-supplied IP header on native sign-in but keep the proxy one when the secret is sent", async () => {
    await fetch(`${baseUrl}/api/auth/sign-in/email`, { method: "POST", headers: { "x-pa-client-ip": "9.9.9.9" }, body: "{}" });
    await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "x-pa-client-ip": "9.9.9.9", authorization: `Bearer ${SECRET}` },
      body: "{}",
    });

    expect(state.seen.map((entry) => entry.clientIp)).toEqual([expect.stringContaining("127.0.0.1"), "9.9.9.9"]);
  });

  it("should keep key sign-in and other auth paths behind the shared secret even with a valid session token", async () => {
    state.validSessionHeaders = ["Bearer session.token"];
    const headers = { authorization: "Bearer session.token" };

    const keySignIn = await fetch(`${baseUrl}/api/auth/sign-in/api-key`, { method: "POST", body: "{}", headers });
    const changePassword = await fetch(`${baseUrl}/api/auth/change-password`, { method: "POST", body: "{}", headers });
    const anonymousKey = await fetch(`${baseUrl}/api/auth/sign-in/api-key`, { method: "POST", body: "{}" });

    expect([keySignIn.status, changePassword.status, anonymousKey.status]).toEqual([401, 401, 401]);
    expect(state.seen).toHaveLength(0);
  });

  it("should accept a valid session token on an ordinary route", async () => {
    state.validSessionHeaders = ["Bearer session.token"];

    const res = await fetch(`${baseUrl}/sync-tokens`, { method: "POST", headers: { authorization: "Bearer session.token" } });

    expect(res.status).not.toBe(401);
  });

  it("should refuse an expired, revoked or tampered session token on an ordinary route", async () => {
    state.validSessionHeaders = ["Bearer session.token"];

    const tampered = await fetch(`${baseUrl}/sync-tokens`, { method: "POST", headers: { authorization: "Bearer session.tokeX" } });
    const gone = await fetch(`${baseUrl}/sync-tokens`, { method: "POST", headers: { authorization: "Bearer other.value" } });

    expect([tampered.status, gone.status]).toEqual([401, 401]);
  });

  it("should still accept the shared secret on an ordinary route", async () => {
    const res = await fetch(`${baseUrl}/sync-tokens`, { method: "POST", headers: { authorization: `Bearer ${SECRET}` } });

    expect(res.status).not.toBe(401);
  });

  it("should refuse an unknown device token on an ordinary route", async () => {
    state.tokenRows = [];

    const res = await fetch(`${baseUrl}/sync-tokens`, { method: "POST", headers: { authorization: "Bearer pat_unknown" } });

    expect(res.status).toBe(401);
  });
});
