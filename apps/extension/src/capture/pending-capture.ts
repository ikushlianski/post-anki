import type { CaptureBody } from "./build-capture-text.js";
import type { SendCaptureResult } from "./send-capture.js";

const PENDING_KEY = "pendingCapture";

export function isRetryable(result: SendCaptureResult): boolean {
  if (result.ok) {
    return false;
  }

  return result.reason === "network" || result.reason === "rate_limited" || (result.reason === "unexpected" && result.status >= 500);
}

export async function keepPendingCapture(body: CaptureBody): Promise<void> {
  await chrome.storage.session.set({ [PENDING_KEY]: body });
}

export async function loadPendingCapture(): Promise<CaptureBody | null> {
  const stored = await chrome.storage.session.get(PENDING_KEY);
  const value = stored[PENDING_KEY] as CaptureBody | undefined;

  return value && typeof value.text === "string" ? value : null;
}

export async function clearPendingCapture(): Promise<void> {
  await chrome.storage.session.remove(PENDING_KEY);
}
