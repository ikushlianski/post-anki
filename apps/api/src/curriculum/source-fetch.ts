const MAX_CHARS_PER_SOURCE = 20_000;
const FETCH_TIMEOUT_MS = 15_000;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      return `[could not fetch ${url}: HTTP ${res.status}]`;
    }

    // Candidate URLs discovered via the general trusted-source search or a
    // same-site crawl are not guaranteed to be HTML (PDFs and other binary
    // documents show up often, e.g. arxiv/ACL papers) — a naive text() read
    // on binary content can carry NUL bytes and other control characters
    // that Postgres's `text` type rejects outright at insert time.
    return sanitizeForStorage(stripHtml(await res.text()));
  } catch {
    return `[could not fetch ${url}]`;
  } finally {
    clearTimeout(timer);
  }
}

const CONTROL_CHARS_EXCEPT_WHITESPACE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g",
);

function sanitizeForStorage(text: string): string {
  return text.replace(CONTROL_CHARS_EXCEPT_WHITESPACE, " ");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string): string {
  return text.length > MAX_CHARS_PER_SOURCE
    ? text.slice(0, MAX_CHARS_PER_SOURCE)
    : text;
}
