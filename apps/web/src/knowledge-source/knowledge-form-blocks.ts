export type BlockType = 'text' | 'url'

export interface Block {
  type: BlockType
  value: string
  force?: boolean
}

export function emptyBlock(): Block {
  return { type: 'text', value: '' }
}

export function modeButtonClass(selected: boolean) {
  return selected
    ? 'rounded-md bg-neutral-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50'
    : 'rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50'
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
