import { MAX_CAPTURE_CHARS } from "../capture/build-capture-text.js";
import type { SendCaptureResult } from "../capture/send-capture.js";
import type { Destination } from "../subjects/describe-subject-path.js";

export type ToastKind = "success" | "info" | "error";
export type ToastMessage = { kind: ToastKind; text: string; durationMs?: number };

export const DESTINATION_TOAST_MS = 5000;

export function describeToast(
  result: SendCaptureResult,
  hasToken: boolean,
  truncated = false,
  retryable = false,
  destination?: Destination,
): ToastMessage {
  const toast = baseToast(result, hasToken, truncated, destination);

  return retryable && toast.kind === "error" ? { ...toast, text: `${toast.text}${RETRY_HINT}` } : toast;
}

const RETRY_HINT = " Click the toolbar button to retry.";

function savedSuffix(destination: Destination | undefined, truncated: boolean): string {
  if (destination === undefined) {
    return truncated ? "" : " to Post Anki";
  }

  switch (destination.kind) {
    case "path":
      return ` to ${destination.path}`;
    case "none":
      return " to Post Anki (no subject, sorted automatically)";
    case "unknown":
      return " (subject not found in your list)";
  }
}

function baseToast(result: SendCaptureResult, hasToken: boolean, truncated: boolean, destination?: Destination): ToastMessage {
  if (result.ok) {
    const lead = truncated ? `Saved the first ${MAX_CAPTURE_CHARS.toLocaleString("en-US")} characters` : "Saved";

    return {
      kind: "success",
      text: `${lead}${savedSuffix(destination, truncated)}`,
      ...(destination === undefined ? {} : { durationMs: DESTINATION_TOAST_MS }),
    };
  }

  if (!hasToken || result.reason === "unauthorized") {
    return {
      kind: "error",
      text: hasToken
        ? "Post Anki rejected your token. Update it in the extension options."
        : "No token set. Add your Post Anki token in the extension options.",
    };
  }

  switch (result.reason) {
    case "already_added":
      return destination?.kind === "path"
        ? { kind: "info", text: `Already in ${destination.path}`, durationMs: DESTINATION_TOAST_MS }
        : { kind: "info", text: "Already in Post Anki" };
    case "network":
      return { kind: "error", text: "Can't reach the Post Anki server. Is it running?" };
    case "bad_request":
      return { kind: "error", text: "Post Anki rejected this text. It may be empty or too long." };
    case "forbidden":
      return { kind: "error", text: "This extension isn't allowed by the Post Anki server." };
    case "too_large":
      return { kind: "error", text: "That selection is too large for Post Anki. Select less text." };
    case "rate_limited":
      return { kind: "error", text: "Post Anki is limiting requests right now. Try again later." };
    case "unexpected":
      return { kind: "error", text: "Post Anki had a server problem. Try again later." };
  }
}
