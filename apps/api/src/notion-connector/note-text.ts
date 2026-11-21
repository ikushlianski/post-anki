export type NoteKind = "word" | "phrase";

const TRAILING_NOISE = /[\s.,!?;:…]+$/;

export function normalizeNote(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(TRAILING_NOISE, "");
}

export function classifyNote(text: string): NoteKind {
  const tokens = text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token));

  return tokens.length === 1 ? "word" : "phrase";
}
