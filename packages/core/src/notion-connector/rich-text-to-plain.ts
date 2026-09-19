export interface RichTextLike {
  plain_text?: string;
}

export function richTextToPlain(richText: readonly RichTextLike[] | undefined): string {
  if (!richText) {
    return "";
  }

  return richText.map((part) => part.plain_text ?? "").join("");
}
