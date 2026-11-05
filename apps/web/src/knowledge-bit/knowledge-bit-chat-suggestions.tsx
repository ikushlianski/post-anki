import type { RelatedCardSuggestion } from '@post-anki/shared'

import type { CardTray } from './use-card-tray'

interface KnowledgeBitChatSuggestionsProps {
  suggestions: RelatedCardSuggestion[]
  tray: CardTray
}

export function KnowledgeBitChatSuggestions({ suggestions, tray }: KnowledgeBitChatSuggestionsProps) {
  return (
    <ul className="mt-2 space-y-2" data-testid="knowledge-bit-chat-suggestions">
      {suggestions.map((suggestion, index) => (
        <li
          key={`${index}-${suggestion.front}`}
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
        >
          <span className="mb-1 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
            {suggestion.origin === 'web' ? 'Web' : 'Your material'}
          </span>
          <p className="font-medium text-neutral-800">{suggestion.front}</p>
          <p className="line-clamp-2 text-neutral-600">{suggestion.back}</p>
          <button
            type="button"
            data-testid={`knowledge-bit-chat-suggestion-${index}`}
            onClick={() => tray.loadProposal(suggestion)}
            className="mt-1 min-h-11 rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 sm:min-h-0 sm:py-1"
          >
            Add to tray
          </button>
        </li>
      ))}
    </ul>
  )
}
