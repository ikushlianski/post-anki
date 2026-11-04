import { detectUnsureMarker } from "./detect-unsure-marker.js";

export interface ParsedPhrase {
  phrase: string;
  hint: string | null;
  unsure: boolean;
  key: string;
}

export interface ParsedPhraseLines {
  phrases: ParsedPhrase[];
  ignored: number;
  duplicatesInInput: number;
}

const LATIN_LETTER = /[A-Za-z]/;
const CYRILLIC_RUN = /[Ѐ-ӿ][\s\S]*$/;
const EDGE_SEPARATORS = /^[\s\-–—:;,]+|[\s\-–—:;,]+$/g;

function stripListMarkers(line: string): string {
  return line
    .replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)?(?:\[[ xX]?\]\s*)?/, "")
    .replace(/^\s*\d+[.)]\s+/, "");
}

function stripFormatting(line: string): string {
  return line
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/(^|\s)_+(?=\S)/g, "$1")
    .replace(/(?<=\S)_+(?=\s|$|[.,!?])/g, "");
}

function trimEdges(text: string): string {
  return text.replace(EDGE_SEPARATORS, "").trim();
}

function splitOffCyrillic(text: string): { rest: string; hint: string | null } {
  const match = CYRILLIC_RUN.exec(text);

  if (!match) {
    return { rest: text, hint: null };
  }

  return { rest: text.slice(0, match.index), hint: trimEdges(match[0]) || null };
}

function splitOffEquals(text: string): { rest: string; hint: string | null } {
  const index = text.indexOf(" = ");

  if (index === -1) {
    return { rest: text, hint: null };
  }

  return { rest: text.slice(0, index), hint: trimEdges(text.slice(index + 3)) || null };
}

function splitOffParenthesis(text: string): { rest: string; hint: string | null } {
  const match = /\s*\(([^()]*)\)\s*$/.exec(text);

  if (!match) {
    return { rest: text, hint: null };
  }

  return { rest: text.slice(0, match.index), hint: match[1]?.trim() || null };
}

export function buildPhraseKey(phrase: string): string {
  const normalized = phrase
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  return `phrase:${normalized}`;
}

function parseLine(raw: string): ParsedPhrase | null {
  const cleaned = stripFormatting(stripListMarkers(raw)).replace(/\s+/g, " ").trim();

  if (!LATIN_LETTER.test(cleaned)) {
    return null;
  }

  const { text: unmarked, unsure } = detectUnsureMarker(cleaned);
  const hints: string[] = [];
  let text = unmarked;

  for (const split of [splitOffCyrillic, splitOffEquals, splitOffParenthesis]) {
    const { rest, hint } = split(text);

    if (hint) {
      hints.unshift(hint);
    }

    text = rest;
  }

  const phrase = trimEdges(text.replace(/\s+/g, " "));

  if (!LATIN_LETTER.test(phrase)) {
    return null;
  }

  return { phrase, hint: hints.length > 0 ? hints.join("; ") : null, unsure, key: buildPhraseKey(phrase) };
}

export function parsePhraseLines(lines: string[]): ParsedPhraseLines {
  const seen = new Map<string, ParsedPhrase>();
  const phrases: ParsedPhrase[] = [];
  let ignored = 0;
  let duplicatesInInput = 0;

  for (const line of lines) {
    const parsed = parseLine(line);

    if (!parsed) {
      ignored += 1;
    } else {
      const kept = seen.get(parsed.key);

      if (kept) {
        duplicatesInInput += 1;
        kept.unsure = kept.unsure || parsed.unsure;
        kept.hint = kept.hint ?? parsed.hint;
      } else {
        seen.set(parsed.key, parsed);
        phrases.push(parsed);
      }
    }
  }

  return { phrases, ignored, duplicatesInInput };
}
