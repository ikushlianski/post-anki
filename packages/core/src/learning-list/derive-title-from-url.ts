const FILLER_SEGMENT_PATTERN = /^(index|introduction)$/i;
const ALL_DIGITS_PATTERN = /^\d+$/;
const MAX_TITLE_LENGTH = 80;
const FALLBACK_TITLE = "Untitled";

// Turns a sibling URL discovered on a page (never given a title by anything
// but its own path) into a readable module name: the last meaningful path
// segment, de-slugified and title-cased, with its file extension dropped.
// A segment that names nothing on its own — an "index"/"introduction"-style
// filler page, or a bare numeric id — steps back to the nearest parent
// segment that actually says something, the way a human skimming the URL
// would read it. Falls back to a fixed placeholder only when the URL has no
// usable path segment at all (e.g. a bare root URL).
export function deriveTitleFromUrl(url: string): string {
  const segments = pathSegments(url);

  if (segments.length === 0) {
    return FALLBACK_TITLE;
  }

  const meaningful = meaningfulSegment(segments);
  const deslugified = deslugify(stripExtension(meaningful));

  return deslugified.length > 0 ? titleCase(deslugified) : FALLBACK_TITLE;
}

function pathSegments(url: string): string[] {
  let pathname: string;

  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split("?")[0]!.split("#")[0]!;
  }

  return pathname
    .split("/")
    .map((segment) => decodeSegment(segment))
    .filter((segment) => segment.length > 0);
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isFiller(segment: string): boolean {
  const withoutExtension = stripExtension(segment);

  return FILLER_SEGMENT_PATTERN.test(withoutExtension) || ALL_DIGITS_PATTERN.test(withoutExtension);
}

// Walks from the last segment towards the root, skipping filler segments,
// and stops at the first segment that says something on its own — or at the
// root segment itself, once there is nowhere left to step back to.
function meaningfulSegment(segments: string[]): string {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]!;

    if (!isFiller(segment) || index === 0) {
      return segment;
    }
  }

  return segments[segments.length - 1]!;
}

function stripExtension(segment: string): string {
  return segment.replace(/\.[a-z0-9]{1,10}$/i, "");
}

function deslugify(segment: string): string {
  return segment
    .replace(/[-_+.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(text: string): string {
  const cased = text
    .split(" ")
    .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");

  return truncate(cased);
}

function truncate(text: string): string {
  if (text.length <= MAX_TITLE_LENGTH) {
    return text;
  }

  const words = text.slice(0, MAX_TITLE_LENGTH).split(" ");

  words.pop();

  return `${words.join(" ")}…`;
}
