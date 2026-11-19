import type { LoadedReviewCards } from './load-review-cards'

export interface SavedCardsView {
  usingSavedCards: boolean
  savedCardsFinished: boolean
}

export function savedCardsView(data: LoadedReviewCards | undefined, hasCard: boolean): SavedCardsView {
  const usingSavedCards = data?.ok === true && data.savedPack === true

  return { usingSavedCards, savedCardsFinished: usingSavedCards && !hasCard }
}
