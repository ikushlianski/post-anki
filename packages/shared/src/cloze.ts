import { z } from "zod";

export const CLOZE_BLANK = "____";
export const CLOZE_MAX_NUMBERS = 10;
export const CLOZE_AI_MAX_NUMBERS = 5;
export const CLOZE_AI_STATEMENT_MAX_CHARS = 200;
export const CLOZE_GAP_MAX_CHARS = 120;
export const CLOZE_NOTE_MAX_CHARS = 2000;
export const CLOZE_ANSWER_SEPARATOR = " / ";

export const clozeErrorSchema = z.enum([
  "empty_gap",
  "nested",
  "unclosed",
  "no_gaps",
  "too_many_gaps",
  "gap_too_long",
]);

export type ClozeError = z.infer<typeof clozeErrorSchema>;

export const CLOZE_ERROR_MESSAGES = {
  empty_gap: "A gap has no text inside it.",
  nested: "Gaps cannot be placed inside each other.",
  unclosed: "A gap is missing its closing }}.",
  no_gaps: "Add at least one gap like {{c1::answer}}.",
  too_many_gaps: `Use at most ${CLOZE_MAX_NUMBERS} different gap numbers.`,
  gap_too_long: `A gap can hold at most ${CLOZE_GAP_MAX_CHARS} characters.`,
} as const satisfies Record<ClozeError, string>;

export type ClozeSegment =
  | { type: "text"; text: string }
  | { type: "gap"; n: number; answer: string; hint: string | null };

export interface ParsedCloze {
  segments: ClozeSegment[];
  numbers: number[];
}

export type ClozeParseResult = { ok: true; note: ParsedCloze } | { ok: false; error: ClozeError };

const OPEN_MARKER = /\{\{c(\d+)::/iy;
const MARKER_START = /\{\{c\d+::/i;

export function parseCloze(text: string): ClozeParseResult {
  const segments: ClozeSegment[] = [];
  const numbers = new Set<number>();
  let cursor = 0;
  let plainFrom = 0;

  while (cursor < text.length) {
    OPEN_MARKER.lastIndex = cursor;

    const open = OPEN_MARKER.exec(text);

    if (!open) {
      cursor += 1;
      continue;
    }

    const bodyStart = cursor + open[0].length;
    const close = text.indexOf("}}", bodyStart);

    if (close === -1) {
      return { ok: false, error: "unclosed" };
    }

    const body = text.slice(bodyStart, close);

    if (MARKER_START.test(body)) {
      return { ok: false, error: "nested" };
    }

    const separator = body.indexOf("::");
    const answer = (separator === -1 ? body : body.slice(0, separator)).trim();
    const hint = separator === -1 ? "" : body.slice(separator + 2).trim();
    const n = Number(open[1]);

    if (!answer || n < 1) {
      return { ok: false, error: "empty_gap" };
    }

    if (answer.length > CLOZE_GAP_MAX_CHARS) {
      return { ok: false, error: "gap_too_long" };
    }

    if (cursor > plainFrom) {
      segments.push({ type: "text", text: text.slice(plainFrom, cursor) });
    }

    segments.push({ type: "gap", n, answer, hint: hint || null });
    numbers.add(n);
    cursor = close + 2;
    plainFrom = cursor;
  }

  if (plainFrom < text.length) {
    segments.push({ type: "text", text: text.slice(plainFrom) });
  }

  if (numbers.size === 0) {
    return { ok: false, error: "no_gaps" };
  }

  if (numbers.size > CLOZE_MAX_NUMBERS) {
    return { ok: false, error: "too_many_gaps" };
  }

  return { ok: true, note: { segments, numbers: [...numbers].sort((a, b) => a - b) } };
}

export function renderClozeFront(note: ParsedCloze, n: number): string {
  return note.segments
    .map((segment) => {
      if (segment.type === "text") {
        return segment.text;
      }

      if (segment.n !== n) {
        return segment.answer;
      }

      return segment.hint ? `${CLOZE_BLANK} (hint: ${segment.hint.replace(/[()]/g, "")})` : CLOZE_BLANK;
    })
    .join("");
}

export function renderClozeAnswer(note: ParsedCloze, n: number): string {
  return note.segments
    .flatMap((segment) => (segment.type === "gap" && segment.n === n ? [segment.answer] : []))
    .join(CLOZE_ANSWER_SEPARATOR);
}

export function stripClozeMarkers(note: ParsedCloze): string {
  return note.segments.map((segment) => (segment.type === "text" ? segment.text : segment.answer)).join("");
}

export interface ClozeCard {
  n: number;
  prompt: string;
  answer: string;
}

export function buildClozeCards(note: ParsedCloze): ClozeCard[] {
  return note.numbers.map((n) => ({
    n,
    prompt: renderClozeFront(note, n),
    answer: renderClozeAnswer(note, n),
  }));
}

export interface ClozeBackPart {
  text: string;
  bold: boolean;
}

const BLANK_WITH_HINT = /____(?: \(hint: [^)]*\))?/g;

export function renderClozeBack(prompt: string, answer: string): ClozeBackPart[] | null {
  const texts = prompt.split(BLANK_WITH_HINT);
  const answers = answer.split(CLOZE_ANSWER_SEPARATOR);

  if (texts.length < 2 || answers.length !== texts.length - 1) {
    return null;
  }

  return texts.flatMap((text, index): ClozeBackPart[] => {
    const parts: ClozeBackPart[] = text ? [{ text, bold: false }] : [];
    const filled = answers[index];

    return filled === undefined ? parts : [...parts, { text: filled, bold: true }];
  });
}

export const editClozeNoteInput = z.object({
  note: z.string().trim().min(1).max(CLOZE_NOTE_MAX_CHARS),
});

export type EditClozeNoteInput = z.input<typeof editClozeNoteInput>;

export function isBlankKind(kind: string): boolean {
  return kind === "fill_in_the_blank" || kind === "cloze" || kind === "list_next";
}
