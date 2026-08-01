import { router } from "expo-router";
import { clearStoredToken, getStoredToken } from "./token-storage";

const DEFAULT_API_BASE_URL = "http://localhost:8030";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "10.0.2.2"]);

export function apiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL;

  return (url && url.trim() !== "" ? url : DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

// Hand-rolled instead of the built-in URL: WHATWG URL returns IPv6 hostnames
// bracketed ("[::1]"), and React Native's own global.URL polyfill
// (Libraries/Core/setUpXHR.js) mangles bracketed IPv6 literals differently —
// neither platform can be trusted to agree with the other or with this
// guard's fixed allowlist. This regex only needs to extract a scheme and a
// host for a fixed, small set of comparisons, so it sidesteps both quirks
// and behaves identically on web and native.
//
// Two real bypasses were found here by a `/debrief` review and are fixed
// below, not just noted: (1) scheme comparison must be case-insensitive —
// real URL parsing normalizes scheme case, so "HTTP://" is plaintext HTTP
// regardless of spelling; (2) an "@" before the host marks embedded
// userinfo ("http://localhost:x@evil-host/"), and real URL parsing treats
// everything after the LAST "@" as the actual host — this parser has no
// use case for userinfo in an API base URL, so any "@" in the authority is
// rejected outright rather than parsed, closing the bypass without adding
// a second parsing path to keep in sync with the first.
function extractProtocolAndHost(url: string): { protocol: string; host: string } {
  const match = /^([a-zA-Z][a-zA-Z\d+\-.]*):\/\/(\[[^\]]+\]|[^/?#]+)/.exec(url);

  if (!match) {
    throw new Error(`Cannot parse API base URL: ${url}`);
  }

  const authority = match[2];

  if (authority.includes("@")) {
    throw new Error(`Refusing to parse a URL with embedded userinfo: ${url}`);
  }

  // Only strip a trailing ":port" for the non-bracketed form — an IPv6
  // literal's own colons must stay intact, and the bracketed alternative
  // above never captures a trailing port in the first place.
  const isBracketed = authority.startsWith("[");
  const host = isBracketed ? authority.replace(/^\[|\]$/g, "") : authority.split(":")[0];

  return { protocol: `${match[1].toLowerCase()}:`, host: host.toLowerCase() };
}

// An allowlist, not a denylist. Rejecting only "http:" would have let every
// other non-secure scheme through unchecked — "ws:", "ftp:", or whatever a
// future config typo produces — since none of them are "http:" and none of
// them are https either. A transport guard that names the one scheme it
// blocks is only ever as good as the list of schemes someone thought of.
export function assertSecureUrl(url: string): void {
  const { protocol, host } = extractProtocolAndHost(url);

  if (protocol === "https:") {
    return;
  }

  if (protocol === "http:" && LOOPBACK_HOSTS.has(host)) {
    return;
  }

  if (protocol === "http:") {
    throw new Error(`Refusing to send requests over plaintext HTTP to a non-local host: ${host}`);
  }

  throw new Error(`Refusing to send requests over a non-HTTPS scheme (${protocol}): ${url}`);
}

export class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function verifyToken(rawToken: string): Promise<boolean> {
  assertSecureUrl(apiBaseUrl());

  try {
    const response = await fetch(`${apiBaseUrl()}/daily-push`, {
      headers: { authorization: `Bearer ${rawToken}` },
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  assertSecureUrl(apiBaseUrl());

  const token = await getStoredToken();

  if (!token) {
    router.replace("/connect");
    throw new ApiRequestError(401, "no token stored");
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (response.status === 401) {
    await clearStoredToken("revoked");
    router.replace("/connect");
    throw new ApiRequestError(401, "token rejected");
  }

  if (!response.ok) {
    throw new ApiRequestError(response.status, `request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}
