import type { CaptureBody } from "./build-capture-text.js";
import { clearPendingCapture, isRetryable, keepPendingCapture, loadPendingCapture } from "./pending-capture.js";
import { sendCapture, type SendCaptureResult } from "./send-capture.js";
import type { Settings } from "../settings/settings.js";

export type RunCaptureResult = { result: SendCaptureResult; retryable: boolean };

export async function runCapture(
  body: CaptureBody,
  settings: Settings,
  send: typeof sendCapture = sendCapture,
): Promise<RunCaptureResult> {
  const result = await send(body, settings);

  if (isRetryable(result)) {
    await keepPendingCapture(body);

    return { result, retryable: true };
  }

  await clearPendingCapture();

  return { result, retryable: false };
}

export async function retryPendingCapture(
  settings: Settings,
  send: typeof sendCapture = sendCapture,
): Promise<RunCaptureResult | null> {
  const body = await loadPendingCapture();

  if (!body) {
    return null;
  }

  return runCapture(body, settings, send);
}
