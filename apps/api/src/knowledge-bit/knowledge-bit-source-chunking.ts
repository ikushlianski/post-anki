export const SOURCE_CHUNK_MAX_CHARS = 3000;

const PARAGRAPH_BREAK = /\n[^\S\n]*\n\s*/;
const SENTENCE_END = /(?<=[.!?…。！？])\s+/u;

function hardSplit(text: string, maxChars: number): string[] {
  const pieces: string[] = [];

  for (let start = 0; start < text.length; start += maxChars) {
    pieces.push(text.slice(start, start + maxChars));
  }

  return pieces;
}

function pack(parts: readonly string[], separator: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const candidate = current.length === 0 ? part : `${current}${separator}${part}`;

    if (candidate.length <= maxChars) {
      current = candidate;

      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    current = part;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function splitOversizeParagraph(paragraph: string, maxChars: number): string[] {
  const sentences = paragraph
    .split(SENTENCE_END)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .flatMap((sentence) => (sentence.length > maxChars ? hardSplit(sentence, maxChars) : [sentence]));

  return pack(sentences, " ", maxChars);
}

export function chunkSourceText(text: string, maxChars: number = SOURCE_CHUNK_MAX_CHARS): string[] {
  const paragraphs = text
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const units = paragraphs.flatMap((paragraph) =>
    paragraph.length > maxChars ? splitOversizeParagraph(paragraph, maxChars) : [paragraph],
  );

  return pack(units, "\n\n", maxChars);
}
