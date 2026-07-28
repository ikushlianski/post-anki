// Extracted from apps/api/src/curriculum/doc-link-grounding.ts's own
// module-private probe()/truncate() (spec.md's Decisions #4) — a pure
// refactor. doc-link-grounding.ts's own behavior and test coverage are
// unchanged: it now imports these instead of keeping private copies.
//
// tracked-tool-fetcher.ts (apps/api/src/domain-map/) is the second caller,
// with its own smaller char cap (MAX_TOOL_CONTENT_CHARS = 4_000, vs.
// doc-link-grounding.ts's 30,000 for llms.txt) and its own hash step — see
// that file.

const CONTROL_CHARS_EXCEPT_WHITESPACE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      return null;
    }

    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function truncateText(text: string, maxChars: number): string {
  const sanitized = text.replace(CONTROL_CHARS_EXCEPT_WHITESPACE, " ");

  return sanitized.length > maxChars ? sanitized.slice(0, maxChars) : sanitized;
}
