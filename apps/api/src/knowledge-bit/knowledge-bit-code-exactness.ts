import { fencedCodeBlocks } from "@post-anki/shared";

function unixNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function codeBody(block: string): string {
  const lines = unixNewlines(block).split("\n");
  const closed = lines.length > 1 && /^`{3,}[ \t]*$/.test(lines[lines.length - 1] ?? "");

  return lines
    .slice(1, closed ? -1 : undefined)
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\s+$/, "");
}

export function hasExactCodeBlocks(text: string, sourceText: string): boolean {
  if (sourceText.trim() === "") {
    return true;
  }

  const source = unixNewlines(sourceText);

  return fencedCodeBlocks(text).every((block) => source.includes(codeBody(block)));
}
