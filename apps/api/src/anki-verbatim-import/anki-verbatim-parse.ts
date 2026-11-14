import { htmlToText } from "../../../anki-batch-mcp/src/anki-html-text.js";
import { cardTextKey } from "../knowledge-bit/knowledge-bit-card-text-key.js";

export type VerbatimCard = {
  front: string;
  back: string;
  example: string | null;
};

export type VerbatimParseResult = {
  cards: VerbatimCard[];
  records: number;
  skippedEmpty: number;
  duplicates: number;
};

function skipHeader(text: string): number {
  let pos = 0;

  while (text[pos] === "#") {
    const end = text.indexOf("\n", pos);

    pos = end === -1 ? text.length : end + 1;
  }

  return pos;
}

function readQuoted(text: string, start: number): { value: string; pos: number } {
  let value = "";
  let pos = start + 1;

  while (pos < text.length) {
    if (text[pos] !== '"') {
      value += text[pos];
      pos += 1;
      continue;
    }

    if (text[pos + 1] === '"') {
      value += '"';
      pos += 2;
      continue;
    }

    return { value, pos: pos + 1 };
  }

  return { value, pos };
}

function readPlain(text: string, start: number): { value: string; pos: number } {
  let pos = start;

  while (pos < text.length && text[pos] !== "\t" && text[pos] !== "\n") {
    pos += 1;
  }

  return { value: text.slice(start, pos), pos };
}

export function readTabRecords(text: string): string[][] {
  const records: string[][] = [];
  let pos = skipHeader(text);

  while (pos < text.length) {
    const fields: string[] = [];

    for (;;) {
      const field = text[pos] === '"' ? readQuoted(text, pos) : readPlain(text, pos);

      fields.push(field.value);
      pos = field.pos;

      while (pos < text.length && text[pos] !== "\t" && text[pos] !== "\n") {
        pos += 1;
      }

      if (text[pos] === "\t") {
        pos += 1;
        continue;
      }

      pos += 1;
      break;
    }

    records.push(fields);
  }

  return records;
}

export function cleanField(html: string): string {
  return htmlToText(html.replace(/\r\n?/g, "\n").replace(/ /g, " "));
}

export function parseVerbatimExport(text: string): VerbatimParseResult {
  const records = readTabRecords(text.replace(/^﻿/, ""));
  const cards: VerbatimCard[] = [];
  const seen = new Set<string>();
  let skippedEmpty = 0;
  let duplicates = 0;

  for (const fields of records) {
    const front = cleanField(fields[0] ?? "");
    const back = cleanField(fields[1] ?? "");
    const example = cleanField(fields[2] ?? "");

    if (!front || !back) {
      skippedEmpty += 1;
      continue;
    }

    const key = cardTextKey(front, back);

    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }

    seen.add(key);
    cards.push({ front, back, example: example || null });
  }

  return { cards, records: records.length, skippedEmpty, duplicates };
}
