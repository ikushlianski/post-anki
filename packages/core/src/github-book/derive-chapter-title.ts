import { meaningfulNameTokens, stripMarkdownExtension } from "./filename-tokens";

const CHAPTER_PREFIX_PATTERN = /^chapter(\d)/i;
const LEADING_CHAPTER_PATTERN = /^chapter\s+(\d+)\s*(.*)$/i;
const LEADING_APPENDIX_PATTERN = /^appendix\s+([a-z])\s*(.*)$/i;
const LEADING_ORDINAL_PATTERN = /^\d+\s+(.+)$/;

// Derives a human-readable chapter title from a repository filename such as
// "Chapter_1-Prompt_Chaining-1flxKGrbnF2g8yh3F-oVD5Xx7ZumId56HbFpIiPdkqLI.md".
// A "Chapter_N-..." or "Appendix_X-..." filename is reshaped into a
// structured "Chapter N — Name" / "Appendix X — Name" title; anything else
// (front- or back-matter such as "04-A_Thought_Leaders...md") keeps its
// descriptive words but drops the bare leading ordinal, since that number
// only encoded directory order and carries no reader-facing meaning on its
// own — see filename-tokens.ts for the hash- and ordinal-stripping rules
// shared with isChapterCandidatePath.
export function deriveChapterTitle(filename: string): string {
  const basename = stripMarkdownExtension(filename);
  const kept = meaningfulNameTokens(basename);
  const humanized = humanizeTokens(kept);

  return (
    formatChapterTitle(humanized) ?? formatAppendixTitle(humanized) ?? dropLeadingOrdinal(humanized)
  );
}

function formatChapterTitle(humanized: string): string | null {
  const normalized = humanized.replace(CHAPTER_PREFIX_PATTERN, "Chapter $1");
  const match = LEADING_CHAPTER_PATTERN.exec(normalized);

  if (!match) {
    return null;
  }

  const [, number, rest] = match;
  const trimmedRest = rest!.trim();

  return trimmedRest.length > 0 ? `Chapter ${number} — ${trimmedRest}` : `Chapter ${number}`;
}

function formatAppendixTitle(humanized: string): string | null {
  const match = LEADING_APPENDIX_PATTERN.exec(humanized);

  if (!match) {
    return null;
  }

  const [, letter, rest] = match;
  const trimmedRest = rest!.trim();
  const label = `Appendix ${letter!.toUpperCase()}`;

  return trimmedRest.length > 0 ? `${label} — ${trimmedRest}` : label;
}

function dropLeadingOrdinal(humanized: string): string {
  const match = LEADING_ORDINAL_PATTERN.exec(humanized);

  if (!match) {
    return humanized;
  }

  const rest = match[1]!.trim();

  return rest.length > 0 ? rest : humanized;
}

function humanizeTokens(tokens: string[]): string {
  return tokens
    .join(" ")
    .replace(/[()]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
