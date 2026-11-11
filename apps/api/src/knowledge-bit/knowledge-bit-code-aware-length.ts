import { fencedCodeBlocks, withoutCodeFences } from "@post-anki/shared";

export const CODE_BLOCK_MAX_CHARS = 1500;
export const CODE_BLOCK_MAX_LINES = 20;

function codeLineCount(block: string): number {
  return Math.max(0, block.split("\n").length - 2);
}

function areCodeBlocksWithinLimits(blocks: string[]): boolean {
  const totalChars = blocks.reduce((sum, block) => sum + block.length, 0);
  const totalLines = blocks.reduce((sum, block) => sum + codeLineCount(block), 0);

  return totalChars <= CODE_BLOCK_MAX_CHARS && totalLines <= CODE_BLOCK_MAX_LINES;
}

export function exceedsLength(text: string, proseMax: number): boolean {
  const blocks = fencedCodeBlocks(text);

  if (blocks.length === 0) {
    return text.length > proseMax;
  }

  return withoutCodeFences(text).trim().length > proseMax || !areCodeBlocksWithinLimits(blocks);
}
