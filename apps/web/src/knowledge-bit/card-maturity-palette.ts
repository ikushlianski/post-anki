export type CardMaturityKind = 'mature' | 'learning' | 'new'

export const CARD_MATURITY_PALETTE: Record<CardMaturityKind, { fill: string; text: string }> = {
  new: { fill: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  learning: { fill: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  mature: { fill: 'bg-green-500', text: 'text-green-600 dark:text-green-400' },
}
