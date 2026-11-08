export const SOURCE_AUTHOR_MAX_CHARS = 120;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;
const META_TAG = /<meta\b[^>]*>/gi;
const JSON_LD_BLOCK = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#")) {
      const point = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);

      return Number.isSafeInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    }

    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function clean(raw: string): string | null {
  const text = decodeEntities(raw).replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, SOURCE_AUTHOR_MAX_CHARS);

  return text.length > 0 && !/^https?:\/\//i.test(text) ? text : null;
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);

  return match ? (match[1] ?? match[2] ?? null) : null;
}

function metaAuthor(html: string): string | null {
  const wanted = new Set(["author", "article:author"]);

  for (const tag of html.match(META_TAG) ?? []) {
    const key = (attribute(tag, "name") ?? attribute(tag, "property") ?? "").toLowerCase();
    const value = attribute(tag, "content");
    const author = wanted.has(key) && value ? clean(value) : null;

    if (author) {
      return author;
    }
  }

  return null;
}

function authorNameOf(node: unknown): string | null {
  if (typeof node === "string") {
    return clean(node);
  }

  if (Array.isArray(node)) {
    return node.map(authorNameOf).find((name) => name !== null) ?? null;
  }

  if (node && typeof node === "object" && "name" in node && typeof node.name === "string") {
    return clean(node.name);
  }

  return null;
}

function authorInJsonLd(node: unknown): string | null {
  if (Array.isArray(node)) {
    return node.map(authorInJsonLd).find((name) => name !== null) ?? null;
  }

  if (!node || typeof node !== "object") {
    return null;
  }

  if ("author" in node) {
    const name = authorNameOf(node.author);

    if (name) {
      return name;
    }
  }

  return "@graph" in node ? authorInJsonLd(node["@graph"]) : null;
}

function jsonLdAuthor(html: string): string | null {
  for (const block of html.matchAll(JSON_LD_BLOCK)) {
    try {
      const author = authorInJsonLd(JSON.parse(block[1] ?? ""));

      if (author) {
        return author;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function extractAuthorFromHtml(html: string): string | null {
  return metaAuthor(html) ?? jsonLdAuthor(html);
}
