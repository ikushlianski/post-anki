import type { KnowledgeHighlight } from './knowledge-highlights'

export type BlockType = 'text' | 'url'

export interface Block {
  type: BlockType
  value: string
  force?: boolean
  targetPhrases?: string[]
  highlights?: KnowledgeHighlight[]
}

export function emptyBlock(): Block {
  return { type: 'text', value: '' }
}

export function failedBlocksMessage(count: number): string {
  if (count === 1) {
    return 'Block 1 could not be added. Try again.'
  }

  const numbers = Array.from({ length: count }, (_, i) => i + 1).join(', ')

  return `Blocks ${numbers} could not be added. Try again.`
}


export function remapByPosition<T>(
  keptIndices: number[],
  values: Map<number, T | null>,
): Record<number, T> {
  return Object.fromEntries(
    keptIndices.flatMap((original, position) => {
      const value = values.get(original)

      return value ? [[position, value]] : []
    }),
  )
}

export const LINK_ERROR_MESSAGE = 'Enter a full link starting with https://'

export function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value.trim()).protocol

    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function hasInvalidLink(blocks: { type: BlockType; value: string }[]): boolean {
  return blocks.some((block) => block.type === 'url' && block.value.trim() !== '' && !isHttpUrl(block.value))
}
