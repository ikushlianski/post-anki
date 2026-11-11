import { fencedCodeRanges } from "@post-anki/shared";

export const SOURCE_CHUNK_MAX_CHARS = 3000;

const PARAGRAPH_BREAK = /\n[^\S\n]*\n\s*/g;
const SENTENCE_END = /(?<=[.!?…。！？])\s+/gu;

export interface ChunkSegment {
  chunkOffset: number;
  sourceStart: number;
  length: number;
}

export interface SourceChunk {
  text: string;
  segments: ChunkSegment[];
}

interface Piece {
  text: string;
  start: number;
}

function splitWithOffsets(text: string, base: number, separator: RegExp): Piece[] {
  const pieces: Piece[] = [];
  let cursor = 0;

  for (const match of text.matchAll(separator)) {
    pieces.push({ text: text.slice(cursor, match.index), start: base + cursor });
    cursor = match.index + match[0].length;
  }

  pieces.push({ text: text.slice(cursor), start: base + cursor });

  return pieces;
}

function trimPiece(piece: Piece): Piece {
  const leading = piece.text.length - piece.text.trimStart().length;

  return { text: piece.text.trim(), start: piece.start + leading };
}

function toUnit(piece: Piece): SourceChunk {
  return {
    text: piece.text,
    segments: [{ chunkOffset: 0, sourceStart: piece.start, length: piece.text.length }],
  };
}

function hardSplit(piece: Piece, maxChars: number): Piece[] {
  const pieces: Piece[] = [];

  for (let offset = 0; offset < piece.text.length; offset += maxChars) {
    pieces.push({ text: piece.text.slice(offset, offset + maxChars), start: piece.start + offset });
  }

  return pieces;
}

function append(current: SourceChunk, unit: SourceChunk, separator: string): SourceChunk {
  const shift = current.text.length + separator.length;

  return {
    text: `${current.text}${separator}${unit.text}`,
    segments: [
      ...current.segments,
      ...unit.segments.map((segment) => ({ ...segment, chunkOffset: segment.chunkOffset + shift })),
    ],
  };
}

function pack(parts: readonly SourceChunk[], separator: string, maxChars: number): SourceChunk[] {
  const chunks: SourceChunk[] = [];
  let current: SourceChunk | null = null;

  for (const part of parts) {
    const candidate: SourceChunk = current === null ? part : append(current, part, separator);

    if (candidate.text.length <= maxChars) {
      current = candidate;

      continue;
    }

    if (current !== null) {
      chunks.push(current);
    }

    current = part;
  }

  if (current !== null && current.text.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function splitParagraphsKeepingCode(text: string): Piece[] {
  const pieces: Piece[] = [];
  let cursor = 0;

  const addProse = (from: number, to: number): void => {
    pieces.push(
      ...splitWithOffsets(text.slice(from, to), from, PARAGRAPH_BREAK)
        .map(trimPiece)
        .filter((paragraph) => paragraph.text.length > 0),
    );
  };

  for (const range of fencedCodeRanges(text)) {
    addProse(cursor, range.start);
    pieces.push({ text: text.slice(range.start, range.end), start: range.start });
    cursor = range.end;
  }

  addProse(cursor, text.length);

  return pieces;
}

function splitOversizeParagraph(paragraph: Piece, maxChars: number): SourceChunk[] {
  const sentences = splitWithOffsets(paragraph.text, paragraph.start, SENTENCE_END)
    .map(trimPiece)
    .filter((sentence) => sentence.text.length > 0)
    .flatMap((sentence) => (sentence.text.length > maxChars ? hardSplit(sentence, maxChars) : [sentence]))
    .map(toUnit);

  return pack(sentences, " ", maxChars);
}

export function chunkSourceTextWithOffsets(
  text: string,
  maxChars: number = SOURCE_CHUNK_MAX_CHARS,
): SourceChunk[] {
  const paragraphs = splitParagraphsKeepingCode(text);
  const units = paragraphs.flatMap((paragraph) =>
    paragraph.text.length > maxChars ? splitOversizeParagraph(paragraph, maxChars) : [toUnit(paragraph)],
  );

  return pack(units, "\n\n", maxChars);
}

export function chunkSourceText(text: string, maxChars: number = SOURCE_CHUNK_MAX_CHARS): string[] {
  return chunkSourceTextWithOffsets(text, maxChars).map((chunk) => chunk.text);
}
