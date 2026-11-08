import { createHash } from "node:crypto";
import { htmlToClozeText, htmlToText } from "./anki-html-text.js";
import { readAnkiRecords } from "./anki-record-reader.js";

export type ParsedNote = {
  hash: string;
  deck: string | null;
  front: string;
  back: string;
  rawText: string;
  isCloze: boolean;
  source: string;
};

export type ParsedExport = {
  headerLines: string[];
  notes: ParsedNote[];
};

const LABEL_DECK = /class="subdeck-label"[^>]*>\s*(?:[^<:]+::)?([^<]+?)\s*</;
const CLOZE_MARKUP = /\{\{c\d+::/;
const CLOZE_GAP = /\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g;
const HIDDEN_DECK = /display:\s*none"?>\s*<div>([^<]+)<\/div>/;

function extractDeck(field: string): string | null {
  const label = LABEL_DECK.exec(field)?.[1];

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
  const deck = extractDeck(field1) ?? extractDeck(field2);

  if (
    field1.includes('id="image-occlusion-container"') ||
    field2.includes('id="image-occlusion-container"')
  ) {
    return { hash, deck, front: "", back: "", rawText: "", isCloze: false, source };
  }

  const isCloze = field1.includes("data-cloze") || CLOZE_MARKUP.test(field1);
  const front = isCloze ? htmlToText(field1).replace(CLOZE_GAP, "$1") : htmlToText(field1);
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
