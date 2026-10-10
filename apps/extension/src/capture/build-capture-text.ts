export const MAX_CAPTURE_CHARS = 50_000;

const SOURCE_PREFIX = "\n\nSource: ";

export type BuildCaptureResult =
  | { ok: true; text: string }
  | { ok: false; reason: "empty_selection" | "invalid_url" };

export type BuildCaptureInput = { selection: string; pageUrl: string };

function normalizeUrl(raw: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  parsed.hash = "";

  return parsed.toString();
}

export function buildCaptureText(input: BuildCaptureInput): BuildCaptureResult {
  const selection = input.selection.trim();

  if (selection.length === 0) {
    return { ok: false, reason: "empty_selection" };
  }

  const url = normalizeUrl(input.pageUrl);

  if (url === null) {
    return { ok: false, reason: "invalid_url" };
  }

  const suffix = SOURCE_PREFIX + url;
  const room = Math.max(0, MAX_CAPTURE_CHARS - suffix.length);
  const body = selection.length > room ? selection.slice(0, room).trimEnd() : selection;

  return { ok: true, text: body + suffix };
}
