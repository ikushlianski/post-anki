import { guardedFetchText } from "./guarded-fetch.js";

const CONTROL_CHARS_EXCEPT_WHITESPACE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  const result = await guardedFetchText(url, { timeoutMs });

  return result.ok ? result.text : null;
}

export function truncateText(text: string, maxChars: number): string {
  const sanitized = text.replace(CONTROL_CHARS_EXCEPT_WHITESPACE, " ");

  return sanitized.length > maxChars ? sanitized.slice(0, maxChars) : sanitized;
}
