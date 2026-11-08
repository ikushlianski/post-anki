import { CLOZE_ANSWER_SEPARATOR, CLOZE_NOTE_MAX_CHARS, parseCloze, stripClozeMarkers } from "@post-anki/shared";
import { hasInjectedMarkup } from "./knowledge-bit-source-item-markup-guard.js";
import { SOURCE_ITEM_STATEMENT_MAX_CHARS } from "./knowledge-bit-source-quote.js";
import { chunkSourceText, SOURCE_CHUNK_MAX_CHARS } from "./knowledge-bit-source-chunking.js";
import type { LessonDraft } from "./knowledge-bit-source-item-validation.js";

export const IMPORTED_CLOZE_EXAMPLE_MAX_CHARS = 200;

const EXAMPLE_MIN_SENTENCE_CUT = 100;
const SENTENCE_END = /[.!?]/g;

export function cutImportedClozeExample(remainder: string): string {
  if (remainder.length <= IMPORTED_CLOZE_EXAMPLE_MAX_CHARS) {
    return remainder.trim();
  }

  const head = remainder.slice(0, IMPORTED_CLOZE_EXAMPLE_MAX_CHARS);
  let sentenceCut = -1;

  for (const match of head.matchAll(SENTENCE_END)) {
    const after = remainder.charAt(match.index + 1);

    if (after === "" || /\s/.test(after)) {
      sentenceCut = match.index + 1;
    }
  }

  if (sentenceCut > EXAMPLE_MIN_SENTENCE_CUT) {
    return head.slice(0, sentenceCut).trim();
  }

  const nextIsSpace = /\s/.test(remainder.charAt(IMPORTED_CLOZE_EXAMPLE_MAX_CHARS));
  const wordCut = nextIsSpace ? head.length : head.search(/\s\S*$/);

  return (wordCut > 0 ? head.slice(0, wordCut) : head).trim();
}

const MARKER_START = /\{\{c\d+::/gi;

function lastMarkerStart(chunk: string): number {
  let last = -1;

  for (const match of chunk.matchAll(MARKER_START)) {
    last = match.index;
  }

  return last;
}

function noteEnd(chunk: string, markerStart: number): number {
  const close = chunk.indexOf("}}", markerStart);
  const from = close === -1 ? markerStart : close;
  const newline = chunk.indexOf("\n", from);

  return newline === -1 ? chunk.length : newline;
}

export function detectImportedCloze(chunk: string): LessonDraft | null {
  const markerStart = lastMarkerStart(chunk);

  if (markerStart === -1) {
    return null;
  }

  const end = noteEnd(chunk, markerStart);
  const note = chunk.slice(0, end).trim();

  if (note.length > CLOZE_NOTE_MAX_CHARS) {
    return null;
  }

  const parsed = parseCloze(note);

  if (!parsed.ok) {
    return null;
  }

  const statement = stripClozeMarkers(parsed.note);
  const remainder = chunk.slice(end).trim();
  const answers = parsed.note.segments.flatMap((segment) => (segment.type === "gap" ? [segment.answer] : []));

  if (statement.length > SOURCE_ITEM_STATEMENT_MAX_CHARS) {
    return null;
  }

  const example = remainder ? cutImportedClozeExample(remainder) : null;

  if (hasInjectedMarkup([statement, example ?? ""], chunk)) {
    return null;
  }

  return {
    statement,
    quote: statement,
    example,
    cards: [
      {
        kind: "cloze",
        question: note,
        answer: answers.join(CLOZE_ANSWER_SEPARATOR),
        statement,
        quote: statement,
      },
    ],
  };
}

export function isImportedClozeSource(rawText: string): boolean {
  const first = chunkSourceText(rawText, SOURCE_CHUNK_MAX_CHARS)[0];

  return first !== undefined && detectImportedCloze(first) !== null;
}
