const FENCE_BLOCK = /^(`{3,})[^\n`]*(?:\r?\n[\s\S]*?)??(?:\r?\n\1[ \t]*\r?$|(?![\s\S]))/gm;

export function mapOutsideCodeFences(text: string, transform: (prose: string) => string): string {
  let out = "";
  let cursor = 0;

  for (const match of text.matchAll(FENCE_BLOCK)) {
    out += transform(text.slice(cursor, match.index));
    out += match[0];
    cursor = match.index + match[0].length;
  }

  return out + transform(text.slice(cursor));
}

export function condenseCodeFences(text: string): string {
  const fenced = [...text.matchAll(FENCE_BLOCK)];

  if (fenced.length === 0) {
    return text;
  }

  const condensed = text.replace(FENCE_BLOCK, " [code] ");

  if (condensed.replace(/\[code\]|\s/g, "") !== "") {
    return condensed;
  }

  const firstLine = (fenced[0]?.[0] ?? "").split("\n").slice(1).find((line) => line.trim() !== "" && !/^`{3,}\s*$/.test(line));

  return firstLine ? `Code: ${firstLine.trim()}` : "[code]";
}

export function fencedCodeBlocks(text: string): string[] {
  return [...text.matchAll(FENCE_BLOCK)].map((match) => match[0]);
}

export function withoutCodeFences(text: string): string {
  return text.replace(FENCE_BLOCK, " ");
}

export function fencedCodeRanges(text: string): Array<{ start: number; end: number }> {
  return [...text.matchAll(FENCE_BLOCK)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}
