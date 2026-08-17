import { extractSourceText } from "@post-anki/core";
import type { RefetchOutcome } from "@post-anki/shared";
import { FETCH_TIMEOUT_MS, guardedFetchText } from "../shared/guarded-fetch.js";

// The task's hard rule: re-fetch MUST go through guardedFetchText — never a
// bare fetch() on a stored source URL, since these URLs came from the open
// web. resolveSourceText (curriculum/source-fetch.ts) also wraps
// guardedFetchText but collapses every failure into a placeholder STRING
// embedded in its return value ("[could not fetch ...]"), with no
// structured outcome a caller can gate a conditional write on — it was
// built for "assemble prompt text once", not "tell me if this attempt
// succeeded". SCENARIO 7 needs the real outcome to decide whether to
// overwrite fetchedText, so this module calls guardedFetchText directly
// instead. The HTML-to-text extraction step is shared with source-fetch.ts
// and learning-list-source.ts via @post-anki/core; only the small
// sanitize/truncate step below stays duplicated per-module, since each
// module's truncation/whitespace-cleanup constants are trivial enough that
// a shared file would add an import for no real reuse.
const MAX_CHARS_PER_SOURCE = 20_000;

const CONTROL_CHARS_EXCEPT_WHITESPACE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);

function sanitizeForStorage(text: string): string {
  return text.replace(CONTROL_CHARS_EXCEPT_WHITESPACE, " ");
}

function truncate(text: string): string {
  return text.length > MAX_CHARS_PER_SOURCE ? text.slice(0, MAX_CHARS_PER_SOURCE) : text;
}

export interface RefetchLinkResult {
  outcome: RefetchOutcome;
  text: string | null;
}

// guardedFetchText's own failure vocabulary is "blocked" | "http_error" |
// "too_many_redirects" | "network_error" — one more value than the schema's
// four-value lastFetchOutcome column permits. too_many_redirects folds into
// network_error here: both are "the fetch attempt itself never produced a
// usable response", and adding a fifth stored outcome value for a redirect-
// loop edge case isn't worth widening the column's app-level vocabulary.
// A truncated success (guardedFetchText's `truncated: true`) is still
// `outcome: "ok"` — a capped-but-real body is a good re-fetch, not a
// failure.
export async function refetchLink(url: string): Promise<RefetchLinkResult> {
  const result = await guardedFetchText(url, { timeoutMs: FETCH_TIMEOUT_MS });

  if (result.ok) {
    return { outcome: "ok", text: truncate(sanitizeForStorage(extractSourceText(result.text))) };
  }

  if (result.outcome === "blocked") {
    return { outcome: "blocked", text: null };
  }

  if (result.outcome === "http_error") {
    return { outcome: "http_error", text: null };
  }

  return { outcome: "network_error", text: null };
}
