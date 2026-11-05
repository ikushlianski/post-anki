export function normalizeUrlForComparison(url: string): string {
  try {
    const parsed = new URL(url);

    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();

    const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, "") : "";

    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
  } catch {
    return url;
  }
}
