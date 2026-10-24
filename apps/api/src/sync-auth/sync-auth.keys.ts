import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { exportJWK, SignJWT, type JWK } from "jose";
import { loadEnv } from "../shared/env.js";

export const SYNC_TOKEN_ALGORITHM = "ES256";
export const SYNC_TOKEN_TTL_SECONDS = 300;

export interface SyncSigningKey {
  kid: string;
  privateKey: KeyObject;
  audience: string[];
}

export type SyncKeyResult =
  | { ok: true; key: SyncSigningKey }
  | { ok: false; reason: "not_configured" | "invalid_key" };

let cached: { pem: string; key: SyncSigningKey } | undefined;

export function resetSyncSigningKeyCache(): void {
  cached = undefined;
}

export function loadSyncSigningKey(): SyncKeyResult {
  const env = loadEnv();
  const pem = env.SYNC_JWT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (!pem) {
    return { ok: false, reason: "not_configured" };
  }

  if (cached?.pem === pem) {
    return { ok: true, key: cached.key };
  }

  try {
    const privateKey = createPrivateKey(pem);

    if (privateKey.asymmetricKeyType !== "ec") {
      return { ok: false, reason: "invalid_key" };
    }

    const key: SyncSigningKey = {
      kid: env.SYNC_JWT_KEY_ID,
      privateKey,
      audience: env.SYNC_JWT_AUDIENCE.split(",").map((a) => a.trim()).filter(Boolean),
    };

    cached = { pem, key };

    return { ok: true, key };
  } catch {
    return { ok: false, reason: "invalid_key" };
  }
}

export async function buildJwks(key: SyncSigningKey): Promise<{ keys: JWK[] }> {
  const publicJwk = await exportJWK(createPublicKey(key.privateKey));

  return {
    keys: [{ ...publicJwk, kid: key.kid, alg: SYNC_TOKEN_ALGORITHM, use: "sig" }],
  };
}

export async function signSyncToken(
  key: SyncSigningKey,
  subject: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<{ token: string; expiresAt: string }> {
  const exp = nowSeconds + SYNC_TOKEN_TTL_SECONDS;

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: SYNC_TOKEN_ALGORITHM, kid: key.kid })
    .setSubject(subject)
    .setAudience(key.audience)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(exp)
    .sign(key.privateKey);

  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}
