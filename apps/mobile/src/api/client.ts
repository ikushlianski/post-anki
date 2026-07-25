import { router } from "expo-router";
import { clearStoredToken, getStoredToken } from "./token-storage";

const DEFAULT_API_BASE_URL = "http://localhost:8030";

export function apiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL;

  return (url && url.trim() !== "" ? url : DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

export class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function verifyToken(rawToken: string): Promise<boolean> {
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
    await clearStoredToken();
    router.replace("/connect");
    throw new ApiRequestError(401, "token rejected");
  }

  if (!response.ok) {
    throw new ApiRequestError(response.status, `request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}
