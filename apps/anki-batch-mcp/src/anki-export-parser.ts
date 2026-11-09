import { createHash } from "node:crypto";
import { htmlToClozeText, htmlToText, MAX_RAW_FIELD_CHARS, unwrapClozeGaps } from "./anki-html-text.js";
import { readAnkiRecords } from "./anki-record-reader.js";

export type ParsedNote = {
  hash: string;
  deck: string | null;
  front: string;
  back: string;
  rawText: string;
  isCloze: boolean;
  source: string;
  oversized?: true;
};

export type ParsedExport = {
  headerLines: string[];
  notes: ParsedNote[];
};

const LABEL_MARKER = 'class="subdeck-label"';
const CLOZE_MARKUP = /\{\{c\d+::/;
const HIDDEN_DECK = /display:\s*none"?>\s*<div>([^<]+)<\/div>/;

function readLabelDeck(field: string): string | null {
  let from = 0;

  for (;;) {
    const marker = field.indexOf(LABEL_MARKER, from);

    if (marker === -1) return null;

    const tagEnd = field.indexOf(">", marker);

    if (tagEnd === -1) return null;

    const textEnd = field.indexOf("<", tagEnd);
    const inner = field.slice(tagEnd + 1, textEnd === -1 ? field.length : textEnd).trim();
    const separator = inner.indexOf("::");
    const hasPath = separator > 0 && !inner.slice(0, separator).includes(":");
    const name = (hasPath ? inner.slice(separator + 2) : inner).trim();

    if (name) return name;

    from = tagEnd;
  }
}

function extractDeck(field: string): string | null {
  const label = readLabelDeck(field);

  if (label) return label;

  return HIDDEN_DECK.exec(field)?.[1]?.trim() ?? null;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function reconcileClozeBack(front: string, back: string): string {
  const collapsedFront = collapse(front);
  const collapsedBack = collapse(back);

  if (collapsedBack === collapsedFront) return "";

  if (collapsedFront && collapsedBack.startsWith(collapsedFront)) {
    return collapsedBack.slice(collapsedFront.length).trim();
  }

  return back;
}

function hashFields(field1: string, field2: string): string {
  return createHash("sha256").update(`${field1}\t${field2}`).digest("hex").slice(0, 16);
}

function buildNote(source: string, field1: string, field2: string): ParsedNote {
  const hash = hashFields(field1, field2);

  if (field1.length > MAX_RAW_FIELD_CHARS || field2.length > MAX_RAW_FIELD_CHARS) {
    return { hash, deck: null, front: "", back: "", rawText: "", isCloze: false, source, oversized: true };
  }

  const deck = extractDeck(field1) ?? extractDeck(field2);

  if (
    field1.includes('id="image-occlusion-container"') ||
    field2.includes('id="image-occlusion-container"')
  ) {
    return { hash, deck, front: "", back: "", rawText: "", isCloze: false, source };
  }

  const isCloze = field1.includes("data-cloze") || CLOZE_MARKUP.test(field1);
  const front = isCloze ? unwrapClozeGaps(htmlToText(field1)) : htmlToText(field1);
  const rawBack = htmlToText(field2);
  const back = isCloze ? reconcileClozeBack(front, rawBack) : rawBack;
  const lead = isCloze ? htmlToClozeText(field1) : front;
  const rawText = back ? `${lead}\n\n${back}` : lead;

  return { hash, deck, front, back, rawText, isCloze, source };
}

export function parseAnkiExport(text: string): ParsedExport {
  const { headerLines, records } = readAnkiRecords(text);

  return {
    headerLines,
    notes: records.map((record) => buildNote(record.source, record.fields[0], record.fields[1])),
  };
}
