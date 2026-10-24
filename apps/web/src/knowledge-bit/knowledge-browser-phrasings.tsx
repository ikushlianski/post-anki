import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

import { variantLabel } from './knowledge-bit-triage-selection'

export function KnowledgeBrowserPhrasings({
  phrasings,
}: {
  phrasings: KnowledgeBitBrowserItem['phrasings']
}) {
  return (
    <ul className="flex gap-3 overflow-x-auto">
      {phrasings.map((phrasing, index) => (
        <li
          key={phrasing.id}
          data-testid="knowledge-browser-phrasing"
          data-role={index === 0 ? 'main' : 'variation'}
          className={`min-w-44 max-w-64 flex-1 rounded border p-2 ${
            index === 0 ? 'border-neutral-400 bg-white' : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            {index === 0 ? 'Main card' : 'Variation'}: {variantLabel(phrasings, index)}
          </span>
          {phrasing.prompt}
        </li>
      ))}
    </ul>
  )
}
