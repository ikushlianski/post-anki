import { MAX_CAPTURE_CHARS } from "../capture/build-capture-text.js";
import type { SendCaptureResult } from "../capture/send-capture.js";

export type ToastKind = "success" | "info" | "error";
export type ToastMessage = { kind: ToastKind; text: string };

export function describeToast(result: SendCaptureResult, hasToken: boolean, truncated = false, retryable = false): ToastMessage {
  const toast = baseToast(result, hasToken, truncated)

  return retryable && toast.kind === "error" ? { ...toast, text: `${toast.text}${RETRY_HINT}` } : toast;
}

const RETRY_HINT = " Click the toolbar button to retry.";

function baseToast(result: SendCaptureResult, hasToken: boolean, truncated: boolean): ToastMessage {
  if (result.ok) {
    return {
      kind: "success",
      text: truncated
        ? `Saved the first ${MAX_CAPTURE_CHARS.toLocaleString("en-US")} characters`
        : "Saved to Post Anki",
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
      return { kind: "info", text: "Already in Post Anki" };
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
