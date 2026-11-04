import type { SendCaptureResult } from "../capture/send-capture.js";

export type SendFeedback = { badge: "OK" | "DUP" | "ERR"; title: string };

export function describeSendResult(result: SendCaptureResult, baseUrl: string): SendFeedback {
  if (result.ok) {
    return { badge: "OK", title: "Saved" };
  }

  switch (result.reason) {
    case "bad_request":
      return { badge: "ERR", title: "Rejected: text invalid or too long" };
    case "already_added":
      return { badge: "DUP", title: "Already added: this selection is already in post-anki" };
    case "unauthorized":
      return { badge: "ERR", title: "Token rejected (401)" };
    case "forbidden":
      return { badge: "ERR", title: "Extension not allowed (403): set EXTENSION_ID in the API env" };
    case "too_large":
      return { badge: "ERR", title: "Selection too large (413)" };
    case "rate_limited":
      return { badge: "ERR", title: "Rate limited (429): try again later" };
    case "network":
      return { badge: "ERR", title: `API not reachable at ${baseUrl}` };
    case "unexpected":
      return { badge: "ERR", title: `API error (${result.status})` };
  }
}
