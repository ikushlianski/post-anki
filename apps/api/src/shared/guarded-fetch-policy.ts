import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";
import type { Dispatcher } from "undici";
import { isPublicIpAddress, isSafeSourceUrl, type SourceUrlVerdict } from "@post-anki/core";
import { loadEnv } from "./env.js";

let cachedExemptRaw: string | undefined;
let cachedExemptOrigins = new Set<string>();

// The e2e stage never sets NODE_ENV=production (the Dockerfile/Cloud Run
// deploy do) — the one signal available to keep a leaked allowlist closed.
function exemptOrigins(): Set<string> {
  const env = loadEnv();
  const raw = env.E2E_SOURCE_FETCH_ALLOWED_ORIGINS;

  if (!raw || env.NODE_ENV === "production") {
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

export function verdictForHop(url: string): SourceUrlVerdict {
  const verdict = isSafeSourceUrl(url);

  if (verdict.allowed) {
    return verdict;
  }

  if (verdict.reason === "malformed_url" || verdict.reason === "unsupported_scheme") {
    return verdict;
  }

  return exemptOrigins().has(new URL(url).origin) ? { allowed: true, url } : verdict;
}

const READABLE_CONTENT_TYPE = /^(text\/|application\/(json|xml|xhtml\+xml|[\w.+-]+\+(json|xml)|x-yaml|yaml|markdown))/i;

export function isReadableContentType(contentType: string | null): boolean {
  return contentType === null || contentType.trim() === "" || READABLE_CONTENT_TYPE.test(contentType.trim());
}

export type PinFailReason = "private_address" | "dns_error" | "dns_timeout";
export type PinResult = { ok: true; dispatcher: Dispatcher } | { ok: false; reason: PinFailReason };

interface DnsEntry { address: string; family: number }

export async function resolveAndPin(url: string, signal: AbortSignal): Promise<PinResult> {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");

  if (exemptOrigins().has(parsed.origin)) {
    // Exempt origin: skip the DNS-public-check but still pin to the resolved address
    // so the connection goes exactly where we validated it.
    if (isIP(host) !== 0) {
      return { ok: true, dispatcher: new Agent() };
    }

    try {
      const addresses = await raceDns(lookup(host, { all: true }) as Promise<DnsEntry[]>, signal);
      const primary = addresses[0];

      if (!primary) {
        return { ok: false, reason: "dns_error" };
      }

      return { ok: true, dispatcher: pinnedAgent(primary) };
    } catch (err) {
      return { ok: false, reason: isAbortError(err) ? "dns_timeout" : "dns_error" };
    }
  }

  if (isIP(host) !== 0) {
    // IP literal — already validated by isSafeSourceUrl; no DNS to pin.
    return { ok: true, dispatcher: new Agent() };
  }

  let addresses: DnsEntry[];

  try {
    addresses = await raceDns(lookup(host, { all: true }) as Promise<DnsEntry[]>, signal);
  } catch (err) {
    return { ok: false, reason: isAbortError(err) ? "dns_timeout" : "dns_error" };
  }

  if (addresses.length === 0 || !addresses.every((entry) => isPublicIpAddress(entry.address))) {
    return { ok: false, reason: "private_address" };
  }

  return { ok: true, dispatcher: pinnedAgent(addresses[0]!) };
}

const DNS_ABORT_MARKER = "dns_abort";

function raceDns<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DnsAbortError());
      return;
    }

    const onAbort = () => reject(new DnsAbortError());

    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

class DnsAbortError extends Error {
  readonly marker = DNS_ABORT_MARKER;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DnsAbortError;
}

function pinnedAgent(entry: { address: string; family: number }): Dispatcher {
  return new Agent({
    connect: {
      lookup: (_host: string, _options: unknown, callback: (err: Error | null, addresses: Array<{ address: string; family: number }>) => void) => {
        callback(null, [{ address: entry.address, family: entry.family }]);
      },
    },
  });
}
