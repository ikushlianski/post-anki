import { generateKeyPairSync } from "node:crypto";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";
process.env.SYNC_JWT_AUDIENCE = "http://localhost:5590";

const state = vi.hoisted(() => ({
  pem: undefined as string | undefined,
  tokenRows: [] as { id: string; tokenHash: string; revokedAt: Date | null }[],
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
    loadEnv: () => ({ ...actual.loadEnv(), SYNC_JWT_PRIVATE_KEY: state.pem }),
  };
});

vi.mock("../api-token/api-token.repo.js", async () => {
  const actual = await vi.importActual<typeof import("../api-token/api-token.repo.js")>(
    "../api-token/api-token.repo.js",
  );

  return { ...actual, touchLastUsed: vi.fn(async () => undefined) };
});

const { createApiServer } = await import("../api-server.js");
const { resetSyncSigningKeyCache } = await import("./sync-auth.keys.js");

const SHARED_SECRET = "the-shared-secret";

function generatePem(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function useKey(pem: string | undefined): void {
  state.pem = pem?.replace(/\n/g, "\\n");
  resetSyncSigningKeyCache();
}

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
  state.tokenRows = [];
  useKey(undefined);
});

async function fetchJwks(): Promise<JSONWebKeySet> {
  return (await (await fetch(`${baseUrl}/sync-keys`)).json()) as JSONWebKeySet;
}

async function mintToken(): Promise<string> {
  const res = await fetch(`${baseUrl}/sync-tokens`, {
    method: "POST",
    headers: { authorization: `Bearer ${SHARED_SECRET}` },
  });

  return ((await res.json()) as { token: string }).token;
}

describe("sync token and key set endpoints", () => {
  it("should issue a token that PowerSync can verify against the served public keys", async () => {
    useKey(generatePem());

    const token = await mintToken();
    const jwks = await fetchJwks();
    const { payload, protectedHeader } = await jwtVerify(token, createLocalJWKSet(jwks), {
      audience: "http://localhost:5590",
    });

    expect(protectedHeader.alg).toBe("ES256");
    expect(protectedHeader.kid).toBe(jwks.keys[0]?.kid);
    expect(payload.sub).toBe("owner");
    expect((jwks.keys[0] as Record<string, unknown>).d).toBeUndefined();
  });

  it("should issue tokens that expire within five minutes", async () => {
    useKey(generatePem());

    const { payload } = await jwtVerify(
      await mintToken(),
      createLocalJWKSet(await fetchJwks()),
    );

    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(300);
    expect(payload.exp! - payload.iat!).toBeGreaterThan(0);
  });

  it("should identify the caller by their personal api token", async () => {
    useKey(generatePem());
    state.tokenRows = [{ id: "apitoken_phone", tokenHash: "x", revokedAt: null }];

    const res = await fetch(`${baseUrl}/sync-tokens`, {
      method: "POST",
      headers: { authorization: "Bearer pat_phone" },
    });
    const { token } = (await res.json()) as { token: string };
    const { payload } = await jwtVerify(
      token,
      createLocalJWKSet(await fetchJwks()),
    );

    expect(payload.sub).toBe("apitoken_phone");
  });

  it("should reject a token request without credentials", async () => {
    useKey(generatePem());

    const res = await fetch(`${baseUrl}/sync-tokens`, { method: "POST" });

    expect(res.status).toBe(401);
  });

  it("should serve the public key set without credentials", async () => {
    useKey(generatePem());

    const res = await fetch(`${baseUrl}/sync-keys`);

    expect(res.status).toBe(200);
  });

  it("should answer with a clear error when no signing key is configured", async () => {
    useKey(undefined);

    const tokenRes = await fetch(`${baseUrl}/sync-tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${SHARED_SECRET}` },
    });
    const keysRes = await fetch(`${baseUrl}/sync-keys`);

    expect(tokenRes.status).toBe(503);
    expect(await tokenRes.json()).toMatchObject({ error: "sync_auth_not_configured" });
    expect(keysRes.status).toBe(503);
  });

  it("should answer with a clear error when the configured key is not an EC key", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

    useKey(privateKey.export({ type: "pkcs8", format: "pem" }).toString());

    const res = await fetch(`${baseUrl}/sync-keys`);

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "sync_auth_invalid_key" });
  });
});
