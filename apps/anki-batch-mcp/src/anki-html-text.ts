const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

function safeCodePoint(code: number): string {
  const isControl = code < 0x20 ? ![9, 10, 13].includes(code) : code >= 0x7f && code <= 0x9f;
  const isSurrogate = code >= 0xd800 && code <= 0xdfff;

  if (!Number.isInteger(code) || code > 0x10ffff || isControl || isSurrogate || code === 0xfffe || code === 0xffff) {
    return "";
  }

  return String.fromCodePoint(code);
}

export function decodeEntities(text: string): string {
  return text.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|([a-zA-Z]+));/g, (match, hex, dec, name) => {
    if (hex) return safeCodePoint(parseInt(hex, 16));

    if (dec) return safeCodePoint(parseInt(dec, 10));

    return NAMED_ENTITIES[name as string] ?? match;
  });
}

const CLOZE_SPAN_OPEN = /(<span[^<>]*\bdata-cloze="([^"<>]*)"[^<>]*>)/g;
const SUBDECK_LABEL_OPEN = /<div[^<>]*class="subdeck-label"[^<>]*>/g;
const TAG = /<[^<>]*>/g;
const CLOZE_OPEN = /\{\{c\d+::/g;
export const MAX_RAW_FIELD_CHARS = 100_000;

function replaceBlocks(
  text: string,
  open: RegExp,
  closer: (match: RegExpExecArray) => RegExp,
  render: (match: RegExpExecArray, inner: string) => string,
): string {
  let out = "";
  let pos = 0;

  for (;;) {
    open.lastIndex = pos;

    const match = open.exec(text);

    if (!match) break;

    const bodyStart = match.index + match[0].length;
    const close = closer(match);

    close.lastIndex = bodyStart;

    const end = close.exec(text);

    if (!end) break;

    out += text.slice(pos, match.index) + render(match, text.slice(bodyStart, end.index));
    pos = end.index + end[0].length;
  }

  return out + text.slice(pos);
}

export function unwrapClozeGaps(text: string): string {
  return replaceBlocks(
    text,
    CLOZE_OPEN,
    () => /\}\}/g,
    (_match, inner) => {
      const hint = inner.indexOf("::");

      return hint === -1 ? inner : inner.slice(0, hint);
    },
  );
}

const ELLIPSIS_HINTS = new Set(["...", "\u2026", ".."]);

type ClozeRenderer = (openTag: string, answer: string, placeholder: string) => string;

function clozeHint(placeholder: string): string {
  const inner = decodeEntities(placeholder.replace(TAG, "")).trim();
  const bracketed = /^\[([\s\S]*)\]$/.exec(inner);
  const hint = (bracketed ? bracketed[1] ?? "" : inner).trim();

  return ELLIPSIS_HINTS.has(hint) ? "" : hint;
}

const renderPlain: ClozeRenderer = (_openTag, answer) => decodeEntities(answer);

const renderMarkup: ClozeRenderer = (openTag, answer, placeholder) => {
  const plain = decodeEntities(answer);
  const hint = clozeHint(placeholder);
  const unsafe = (value: string) => value.includes("::") || value.includes("}}");

  if (unsafe(plain) || unsafe(hint)) return plain;

  const ordinal = /\bdata-ordinal="(\d+)"/.exec(openTag)?.[1] ?? "1";

  return hint ? `{{c${ordinal}::${plain}::${hint}}}` : `{{c${ordinal}::${plain}}}`;
};

function dropElements(html: string, name: string): string {
  return replaceBlocks(
    html,
    new RegExp(`<${name}\\b[^<>]*>`, "gi"),
    () => new RegExp(`</${name}>`, "gi"),
    () => "",
  );
}

function convert(html: string, renderCloze: ClozeRenderer): string {
  const labelless = replaceBlocks(html, SUBDECK_LABEL_OPEN, () => /<\/div>/g, () => "");
  const clozed = replaceBlocks(
    labelless,
    CLOZE_SPAN_OPEN,
    () => /<\/span>/g,
    (match, inner) => renderCloze(match[1] as string, match[2] as string, inner),
  );
  const text = ["script", "style", "canvas", "button"]
    .reduce(dropElements, clozed)
    .replace(/<img\b[^<>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^<>]*>/gi, "\n- ")
    .replace(/<\/(div|p|li|h[1-6]|ul|ol)>/gi, "\n")
    .replace(TAG, "");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToText(html: string): string {
  return convert(html, renderPlain);
}

export function htmlToClozeText(html: string): string {
  return convert(html, renderMarkup);
}
