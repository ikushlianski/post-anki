import type { Settings } from "../settings/settings.js";

export type SendCaptureResult =
  | { ok: true }
  | { ok: false; reason: "bad_request" | "unauthorized" | "forbidden" | "network" | "unexpected" };

type FetchImpl = typeof fetch;

function reasonForStatus(status: number): Extract<SendCaptureResult, { ok: false }>["reason"] {
  if (status === 400) {
    return "bad_request";
  }

  if (status === 401) {
    return "unauthorized";
  }

  if (status === 403) {
    return "forbidden";
  }

  return "unexpected";
}

export async function sendCapture(
  text: string,
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
      body: JSON.stringify({ text }),
    });

    if (response.status === 201) {
      return { ok: true };
    }

    return { ok: false, reason: reasonForStatus(response.status) };
  } catch {
    return { ok: false, reason: "network" };
  }
}
