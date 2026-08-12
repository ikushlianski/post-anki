const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  copy: "©",
  reg: "®",
  trade: "™",
};

const HEX_ENTITY_PATTERN = /&#x([0-9a-f]+);/gi;
const DECIMAL_ENTITY_PATTERN = /&#(\d+);/g;
const NAMED_ENTITY_PATTERN = /&([a-z]+);/gi;

// Decodes the entities real pages actually use: numeric ones (decimal and
// hex, which covers curly quotes like &#8217; and any other code point) via
// String.fromCodePoint, and a fixed table of common named entities. Any
// entity not in the table is left as literal text rather than blanked, so an
// unrecognized entity never silently deletes part of a sentence.
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(HEX_ENTITY_PATTERN, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(DECIMAL_ENTITY_PATTERN, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(NAMED_ENTITY_PATTERN, (match, name: string) => {
      const decoded = NAMED_ENTITIES[name.toLowerCase()];

      return decoded ?? match;
    });
}
