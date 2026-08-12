const MARKDOWN_EXTENSION_PATTERN = /\.md$/i;
const CHAPTER_PREFIX_PATTERN = /^chapter(\d)/i;
const LEADING_CHAPTER_PATTERN = /^chapter\s+(\d+)\s*(.*)$/i;

// Derives a human-readable chapter title from a repository filename such as
// "Chapter_1-Prompt_Chaining-1flxKGrbnF2g8yh3F-oVD5Xx7ZumId56HbFpIiPdkqLI.md".
//
// The trailing ID cannot be isolated by simply taking "the last '-'-joined
// segment": real export tools (Google Docs -> markdown converters, in
// particular) embed IDs that themselves contain hyphens, so the ID and a
// genuine hyphenated title word (e.g. "Multi-Agent") are shaped the same at
// the string level. Instead, tokens are inspected from the end and dropped
// as long as they don't "look like a word" — a real title token is either
// all digits (a chapter number) or starts with an uppercase letter with no
// digit mixed into the same underscore-delimited part; an opaque ID token
// mixes digits and letters within a part. This also survives IDs that
// happen to be split across several trailing "-" tokens.
export function deriveChapterTitle(filename: string): string {
  const basename = filename.replace(MARKDOWN_EXTENSION_PATTERN, "");
  const tokens = basename.split("-").filter((token) => token.length > 0);
  const kept = dropTrailingHashTokens(tokens);
  const humanized = humanizeTokens(kept.length > 0 ? kept : tokens);
  const normalized = humanized.replace(CHAPTER_PREFIX_PATTERN, "Chapter $1");
  const chapterMatch = LEADING_CHAPTER_PATTERN.exec(normalized);

  if (!chapterMatch) {
    return normalized;
  }

  const [, number, rest] = chapterMatch;
  const trimmedRest = rest!.trim();

  return trimmedRest.length > 0 ? `Chapter ${number} — ${trimmedRest}` : `Chapter ${number}`;
}

function dropTrailingHashTokens(tokens: string[]): string[] {
  let end = tokens.length;

  while (end > 1 && !isWordishToken(tokens[end - 1]!)) {
    end -= 1;
  }

  return tokens.slice(0, end);
}

function isWordishToken(rawToken: string): boolean {
  const stripped = rawToken.replace(/[()]/g, "");
  const parts = stripped.split("_").filter((part) => part.length > 0);

  return parts.length > 0 && parts.every(isWordishPart);
}

function isWordishPart(part: string): boolean {
  const hasDigit = /\d/.test(part);
  const hasLetter = /[A-Za-z]/.test(part);

  if (hasDigit && hasLetter) {
    return false;
  }

  if (hasDigit) {
    return true;
  }

  return /^[A-Z]/.test(part);
}

function humanizeTokens(tokens: string[]): string {
  return tokens
    .join(" ")
    .replace(/[()]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
