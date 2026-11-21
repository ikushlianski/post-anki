export interface PhraseBlock {
  id: string;
  type: string;
  text: string;
  hasChildren: boolean;
}

export interface BlocksPage {
  blocks: PhraseBlock[];
  nextCursor: string | null;
}

export function phraseKey(blockId: string): string {
  return `notion:${blockId}`;
}

export function isImportable(block: PhraseBlock): boolean {
  return block.type === "bulleted_list_item" && !block.hasChildren && block.text.trim().length > 0;
}
