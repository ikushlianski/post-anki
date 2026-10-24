import type { CaptureBody } from "./build-capture-text.js";
import type { Settings } from "../settings/settings.js";

export type SendCaptureResult =
  | { ok: true }
  | { ok: false; reason: "bad_request" | "already_added" | "unauthorized" | "forbidden" | "network" }
  | { ok: false; reason: "unexpected"; status: number };

type FetchImpl = typeof fetch;

function failureForStatus(status: number): Extract<SendCaptureResult, { ok: false }> {
  if (status === 400) {
    return { ok: false, reason: "bad_request" };
  }

  if (status === 409) {
    return { ok: false, reason: "already_added" };
  }

  if (status === 401) {
    return { ok: false, reason: "unauthorized" };
  }

  if (status === 403) {
    return { ok: false, reason: "forbidden" };
  }

  return { ok: false, reason: "unexpected", status };
}

export async function sendCapture(
  body: CaptureBody,
  settings: Settings,
  fetchImpl: FetchImpl = fetch,
): Promise<SendCaptureResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (settings.token !== "") {
    headers["Authorization"] = `Bearer ${settings.token}`;
  }

  try {
    const response = await fetchImpl(`${settings.baseUrl}/knowledge-sources`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (response.status === 201) {
      return { ok: true };
    }

    return failureForStatus(response.status);
  } catch {
    return { ok: false, reason: "network" };
  }
}
