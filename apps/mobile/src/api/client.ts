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
function extractProtocolAndHost(url: string): { protocol: string; host: string } {
  const match = /^([a-zA-Z][a-zA-Z\d+\-.]*):\/\/(\[[^\]]+\]|[^/:?#]+)/.exec(url);

  if (!match) {
    throw new Error(`Cannot parse API base URL: ${url}`);
  }

  return { protocol: `${match[1]}:`, host: match[2].replace(/^\[|\]$/g, "") };
}

export function assertSecureUrl(url: string): void {
  const { protocol, host } = extractProtocolAndHost(url);

  if (protocol === "http:" && !LOOPBACK_HOSTS.has(host)) {
    throw new Error(`Refusing to send requests over plaintext HTTP to a non-local host: ${host}`);
  }
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
