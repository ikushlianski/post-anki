import type { NotionItem } from "@post-anki/shared";
import { extractTag } from "./extract-tag.js";
import { richTextToPlain, type RichTextLike } from "./rich-text-to-plain.js";

const TEXT_BLOCK_TYPES = [
  "paragraph",
  "bulleted_list_item",
  "numbered_list_item",
  "quote",
  "to_do",
] as const;

type TextBlockType = (typeof TEXT_BLOCK_TYPES)[number];

export interface BlockLike {
  id: string;
  type: string;
  last_edited_time: string;
  [key: string]: unknown;
}

function richTextOf(block: BlockLike): readonly RichTextLike[] | undefined {
  const payload = block[block.type];

  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  return (payload as { rich_text?: readonly RichTextLike[] }).rich_text;
}

export function itemsFromBlocks(blocks: readonly BlockLike[]): NotionItem[] {
  const items: NotionItem[] = [];

  for (const block of blocks) {
    if (!TEXT_BLOCK_TYPES.includes(block.type as TextBlockType)) {
      continue;
    }

    const { tag, body } = extractTag(richTextToPlain(richTextOf(block)));

    if (body.length === 0) {
      continue;
    }

    items.push({ id: block.id, text: body, tags: tag ? [tag] : [], lastEditedTime: block.last_edited_time });
  }

  return items;
}
