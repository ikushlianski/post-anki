import { useState } from 'react'
import type { Ref } from 'react'
import type { PendingKnowledgeBitForReview } from '@post-anki/shared'

import { AiLabelBadge } from './ai-label-badge'

const COLLAPSE_LINES = 4
const COLLAPSE_CHARS = 280

function isLong(text: string): boolean {
  return text.split('\n').length > COLLAPSE_LINES || text.length > COLLAPSE_CHARS
}

interface KnowledgeBitFocusSourceBlockProps {
  bit: PendingKnowledgeBitForReview
  subjectName: string | null
  sourceText: string | null
  headingRef: Ref<HTMLHeadingElement>
}

export function KnowledgeBitFocusSourceBlock({
  bit,
  subjectName,
  sourceText,
  headingRef,
}: KnowledgeBitFocusSourceBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const long = sourceText ? isLong(sourceText) : false

  return (
    <div data-testid="knowledge-bit-focus-fact" className="space-y-2 text-sm text-neutral-600">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Fact</p>
      <h2
        ref={headingRef}
        tabIndex={-1}
        data-testid="knowledge-bit-focus-statement"
        className="text-sm font-medium leading-snug text-neutral-700 outline-none"
      >
        {bit.body}
      </h2>
      <AiLabelBadge
        isAiGenerated={bit.isAiGenerated}
        sourceLinks={bit.sourceLinks}
        testIdSuffix={`-${bit.id}`}
      />
      {sourceText ? (
        <div data-testid="knowledge-bit-focus-source" className="space-y-1">
          <p className="text-xs font-medium text-neutral-500">
            Source{subjectName ? ` · ${subjectName}` : ''}
          </p>
          <p
            data-testid="knowledge-bit-focus-source-text"
            className={`whitespace-pre-wrap rounded-md bg-neutral-50 p-3 text-neutral-500 ${
              long && !expanded ? 'line-clamp-4' : ''
            }`}
          >
            {sourceText}
          </p>
          {long ? (
            <button
              type="button"
              data-testid="knowledge-bit-focus-source-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="min-h-11 text-xs font-medium text-neutral-500 hover:text-neutral-900 sm:min-h-8"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
