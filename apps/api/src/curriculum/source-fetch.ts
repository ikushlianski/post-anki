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

    return stripHtml(await res.text());
  } catch {
    return `[could not fetch ${url}]`;
  } finally {
    clearTimeout(timer);
  }
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
