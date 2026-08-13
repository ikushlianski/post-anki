import {
  isSafeSourceUrl,
  rewriteGithubBlobUrl,
  type SourceUrlRejectionReason,
  type SourceUrlVerdict,
} from "@post-anki/core";
import { loadEnv } from "./env.js";

export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 5_000_000;
export const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface GuardedFetchOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface GuardedFetchSuccess {
  ok: true;
  finalUrl: string;
  status: number;
  text: string;
  truncated: boolean;
}

export interface GuardedFetchBlocked {
  ok: false;
  outcome: "blocked";
  reason: SourceUrlRejectionReason;
  message: string;
  blockedUrl: string;
}

export interface GuardedFetchHttpError {
  ok: false;
  outcome: "http_error";
  status: number;
}

export interface GuardedFetchFailed {
  ok: false;
  outcome: "too_many_redirects" | "network_error";
}

export type GuardedFetchResult =
  | GuardedFetchSuccess
  | GuardedFetchBlocked
  | GuardedFetchHttpError
  | GuardedFetchFailed;

export async function guardedFetchText(
  url: string,
  options: GuardedFetchOptions = {},
): Promise<GuardedFetchResult> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // A GitHub blob URL is rewritten to its raw.githubusercontent.com
    // equivalent before anything else runs, so isSafeSourceUrl and the
    // redirect loop below see and guard the URL that is actually fetched —
    // this never bypasses the safety check, it just changes which URL the
    // check (and the fetch) applies to.
    let current = rewriteGithubBlobUrl(url);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const verdict = verdictForHop(current);

      if (!verdict.allowed) {
        return {
          ok: false,
          outcome: "blocked",
          reason: verdict.reason,
          message: verdict.message,
          blockedUrl: current,
        };
      }

      const res = await fetch(current, { signal: controller.signal, redirect: "manual" });

      if (REDIRECT_STATUSES.has(res.status)) {
        await res.body?.cancel();
        const next = resolveLocation(res.headers.get("location"), current);

        if (next === null) {
          return { ok: false, outcome: "http_error", status: res.status };
        }

        current = next;
        continue;
      }

      if (!res.ok) {
        await res.body?.cancel();

        return { ok: false, outcome: "http_error", status: res.status };
      }

      const body = await readCapped(res, maxResponseBytes);

      return { ok: true, finalUrl: current, status: res.status, ...body };
    }

    return { ok: false, outcome: "too_many_redirects" };
  } catch {
    return { ok: false, outcome: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

let cachedExemptRaw: string | undefined;
let cachedExemptOrigins = new Set<string>();

function exemptOrigins(): Set<string> {
  const raw = loadEnv().E2E_SOURCE_FETCH_ALLOWED_ORIGINS;

  if (!raw) {
    return new Set();
  }

  if (cachedExemptRaw !== raw) {
    cachedExemptRaw = raw;
    cachedExemptOrigins = new Set(
      raw
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    );
  }

  return cachedExemptOrigins;
}

function verdictForHop(url: string): SourceUrlVerdict {
  const verdict = isSafeSourceUrl(url);

  if (verdict.allowed) {
    return verdict;
  }

  if (verdict.reason === "malformed_url" || verdict.reason === "unsupported_scheme") {
    return verdict;
  }

  return exemptOrigins().has(new URL(url).origin) ? { allowed: true, url } : verdict;
}

function resolveLocation(location: string | null, currentUrl: string): string | null {
  if (!location) {
    return null;
  }

  try {
    return new URL(location, currentUrl).toString();
  } catch {
    return null;
  }
}

async function readCapped(
  res: Response,
  maxResponseBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const body = res.body;

  if (!body) {
    return { text: "", truncated: false };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (total < maxResponseBytes) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    const remaining = maxResponseBytes - total;

    if (value.byteLength >= remaining) {
      chunks.push(value.subarray(0, remaining));
      total = maxResponseBytes;
      truncated = true;
      await reader.cancel();
      break;
    }

    chunks.push(value);
    total += value.byteLength;
  }

  return { text: new TextDecoder().decode(Buffer.concat(chunks)), truncated };
}
