import { extractSourceText } from "@post-anki/core";
import { FETCH_TIMEOUT_MS, guardedFetchText } from "../shared/guarded-fetch.js";

const MAX_CHARS_PER_SOURCE = 20_000;

export async function resolveSourceText(
  kind: string,
  value: string,
): Promise<string> {
  if (kind === "text") {
    return truncate(value);
  }

  return truncate(await fetchLink(value));
}

async function fetchLink(url: string): Promise<string> {
  const result = await guardedFetchText(url, { timeoutMs: FETCH_TIMEOUT_MS });

  if (result.ok) {
    return sanitizeForStorage(extractSourceText(result.text));
  }

  if (result.outcome === "blocked") {
    return `[could not fetch ${url}: ${result.message}]`;
  }

  if (result.outcome === "http_error") {
    return `[could not fetch ${url}: HTTP ${result.status}]`;
  }

  return `[could not fetch ${url}]`;
}

const CONTROL_CHARS_EXCEPT_WHITESPACE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);

function sanitizeForStorage(text: string): string {
  return text.replace(CONTROL_CHARS_EXCEPT_WHITESPACE, " ");
}

function truncate(text: string): string {
  return text.length > MAX_CHARS_PER_SOURCE
    ? text.slice(0, MAX_CHARS_PER_SOURCE)
    : text;
}
