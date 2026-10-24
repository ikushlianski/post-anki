export function normalizeSourceUrl(raw: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const path = parsed.pathname.replace(/\/+$/, "");

  return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
}

export function hostOf(raw: string): string | null {
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}
