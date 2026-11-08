export type RawRecord = {
  source: string;
  fields: [string, string];
};

export type ReadExport = {
  headerLines: string[];
  records: RawRecord[];
};

function readHeader(text: string): { headerLines: string[]; pos: number } {
  const headerLines: string[] = [];
  let pos = 0;

  while (text[pos] === "#") {
    const end = text.indexOf("\n", pos);
    const next = end === -1 ? text.length : end + 1;

    headerLines.push(text.slice(pos, next).replace(/\n$/, ""));
    pos = next;
  }

  return { headerLines, pos };
}

function readQuotedField(text: string, start: number): { value: string; pos: number } {
  let value = "";
  let pos = start + 1;

  while (pos < text.length) {
    const char = text[pos];

    if (char === '"') {
      if (text[pos + 1] === '"') {
        value += '"';
        pos += 2;
        continue;
      }

      return { value, pos: pos + 1 };
    }

    value += char;
    pos += 1;
  }

  return { value, pos };
}

function readPlainField(text: string, start: number): { value: string; pos: number } {
  let pos = start;

  while (pos < text.length && text[pos] !== "\t" && text[pos] !== "\n") {
    pos += 1;
  }

  return { value: text.slice(start, pos), pos };
}

function readRecord(text: string, start: number): { record: RawRecord; pos: number } {
  const fields: string[] = [];
  let pos = start;

  for (;;) {
    const field = text[pos] === '"' ? readQuotedField(text, pos) : readPlainField(text, pos);

    fields.push(field.value);
    pos = field.pos;

    while (pos < text.length && text[pos] !== "\t" && text[pos] !== "\n") {
      pos += 1;
    }

    if (text[pos] === "\t") {
      pos += 1;
      continue;
    }

    break;
  }

  const end = pos < text.length ? pos + 1 : pos;

  return {
    record: { source: text.slice(start, end), fields: [fields[0] ?? "", fields[1] ?? ""] },
    pos: end,
  };
}

export function readAnkiRecords(text: string): ReadExport {
  const { headerLines, pos: bodyStart } = readHeader(text);
  const records: RawRecord[] = [];
  let pos = bodyStart;

  while (pos < text.length) {
    const { record, pos: next } = readRecord(text, pos);

    records.push(record);
    pos = next;
  }

  return { headerLines, records };
}
