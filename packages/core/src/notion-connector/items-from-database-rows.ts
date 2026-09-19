import type { NotionItem } from "@post-anki/shared";
import { richTextToPlain, type RichTextLike } from "./rich-text-to-plain.js";

interface PropertyLike {
  type: string;
  title?: readonly RichTextLike[];
  multi_select?: readonly { name: string }[];
  select?: { name: string } | null;
}

export interface DatabaseRowLike {
  id: string;
  properties: Record<string, PropertyLike>;
}

function titleOf(row: DatabaseRowLike): string {
  const title = Object.values(row.properties).find((property) => property.type === "title");

  return richTextToPlain(title?.title).trim();
}

function tagsOf(row: DatabaseRowLike): string[] {
  const tags = row.properties["Tags"];

  if (tags?.type === "multi_select") {
    return (tags.multi_select ?? []).map((option) => option.name);
  }

  const tag = row.properties["Tag"];

  if (tag?.type === "select" && tag.select) {
    return [tag.select.name];
  }

  return [];
}

export function itemsFromDatabaseRows(rows: readonly DatabaseRowLike[]): NotionItem[] {
  const items: NotionItem[] = [];

  for (const row of rows) {
    const text = titleOf(row);

    if (text.length === 0) {
      continue;
    }

    items.push({ id: row.id, text, tags: tagsOf(row) });
  }

  return items;
}
