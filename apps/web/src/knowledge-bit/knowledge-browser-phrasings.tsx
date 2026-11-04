import { Fragment } from 'react'

import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

import { CardContextLine } from './card-context-line'

export function KnowledgeBrowserPhrasings({
  phrasings,
}: {
  phrasings: KnowledgeBitBrowserItem['phrasings']
}) {
  return (
    <span className="block min-w-0">
      <CardContextLine context={phrasings[0]?.context} testId="knowledge-browser-phrasing-context" />
      <span
        data-testid="knowledge-browser-phrasing-question"
        className="block truncate"
        title={phrasings.map((phrasing) => phrasing.prompt).join('\n')}
      >
        {phrasings.map((phrasing, index) => (
          <Fragment key={phrasing.id}>
            {index > 0 && ' · '}
            <span
              data-testid="knowledge-browser-phrasing"
              data-role={index === 0 ? 'main' : 'variation'}
              className={index === 0 ? 'font-medium' : 'text-neutral-600'}
            >
              {phrasing.prompt}
            </span>
          </Fragment>
        ))}
      </span>
    </span>
  )
}
