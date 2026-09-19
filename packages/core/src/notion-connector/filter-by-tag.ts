import type { NotionItem } from "@post-anki/shared";

export function filterByTag(items: readonly NotionItem[], tag: string): NotionItem[] {
  const wanted = tag.toLowerCase();

  return items.filter((item) => item.tags.some((candidate) => candidate.toLowerCase() === wanted));
}
