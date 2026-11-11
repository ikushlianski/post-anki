export const MAX_CAPTURE_CHARS = 50_000;
export const MAX_TITLE_CHARS = 300;
export const MAX_SOURCE_URL_CHARS = 2048;

export type CaptureBody = {
  text: string;
  sourceUrl?: string;
  title?: string;
  subjectId?: string;
};

export type BuildCaptureResult =
  | { ok: true; body: CaptureBody; truncated: boolean }
  | { ok: false; reason: "empty_selection" };

export type BuildCaptureInput = {
  selection: string;
  pageUrl?: string;
  title?: string;
  subjectId?: string;
};

function safeSourceUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }

  parsed.hash = "";

  const url = parsed.toString();

  return url.length <= MAX_SOURCE_URL_CHARS ? url : undefined;
}

function closeOpenFence(text: string): string {
  let open: string | null = null;

  for (const line of text.split("\n")) {
    const fence = /^(`{3,})/.exec(line)?.[1];

    if (!fence) {
      continue;
    }

    if (open === null) {
      open = fence;
    } else if (fence.length >= open.length && line.trim() === fence) {
      open = null;
    }
  }

  return open === null ? text : `${text}\n${open}`;
}

export function buildCaptureText(input: BuildCaptureInput): BuildCaptureResult {
  const trimmed = input.selection.trim();
  const truncated = trimmed.length > MAX_CAPTURE_CHARS;
  const cut = trimmed.slice(0, MAX_CAPTURE_CHARS).trimEnd();
  const closed = truncated ? closeOpenFence(cut) : cut;
  const text = closed.length > MAX_CAPTURE_CHARS ? closeOpenFence(cut.slice(0, MAX_CAPTURE_CHARS - 32).trimEnd()) : closed;

  if (text.length === 0) {
    return { ok: false, reason: "empty_selection" };
  }

  const body: CaptureBody = { text };
  const sourceUrl = safeSourceUrl(input.pageUrl);
  const title = input.title?.trim().slice(0, MAX_TITLE_CHARS).trimEnd();
  const subjectId = input.subjectId?.trim();

  if (sourceUrl !== undefined) {
    body.sourceUrl = sourceUrl;
  }

  if (title) {
    body.title = title;
  }

  if (subjectId) {
    body.subjectId = subjectId;
  }

  return { ok: true, body, truncated };
}
