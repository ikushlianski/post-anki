const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|([a-zA-Z]+));/g, (match, hex, dec, name) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));

    if (dec) return String.fromCodePoint(parseInt(dec, 10));

    return NAMED_ENTITIES[name as string] ?? match;
  });
}

const CLOZE_SPAN = /(<span[^>]*\bdata-cloze="([^"]*)"[^>]*>)([\s\S]*?)<\/span>/g;
const ELLIPSIS_HINTS = new Set(["...", "\u2026", ".."]);

type ClozeRenderer = (openTag: string, answer: string, placeholder: string) => string;

function clozeHint(placeholder: string): string {
  const inner = decodeEntities(placeholder.replace(/<[^>]*>/g, "")).trim();
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

function convert(html: string, renderCloze: ClozeRenderer): string {
  const text = html
    .replace(/<div[^>]*class="subdeck-label"[^>]*>[\s\S]*?<\/div>/g, "")
    .replace(CLOZE_SPAN, (_match, openTag: string, answer: string, placeholder: string) =>
      renderCloze(openTag, answer, placeholder),
    )
    .replace(/<(script|style|canvas|button)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(div|p|li|h[1-6]|ul|ol)>/gi, "\n")
    .replace(/<[^>]*>/g, "");

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
