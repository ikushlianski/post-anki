import { useRef } from 'react'
import type { KeyboardEvent } from 'react'

import { KNOWLEDGE_HIGHLIGHTS_MAX, addHighlight, highlightExcerpt, highlightSegments } from './knowledge-highlights'
import type { KnowledgeHighlight } from './knowledge-highlights'
import { DEFAULT_HIGHLIGHT_SHORTCUT, describeHighlightShortcut, matchesHighlightShortcut } from './highlight-shortcut'
import type { HighlightShortcut } from './highlight-shortcut'

interface HighlightedTextFieldProps {
  index: number
  value: string
  highlights: KnowledgeHighlight[]
  disabled: boolean
  highlightUnavailable?: boolean
  highlightShortcut?: HighlightShortcut
  onValueChange: (value: string) => void
  onHighlightsChange: (highlights: KnowledgeHighlight[]) => void
  onSubmitShortcut: () => void
}

const sharedBox = 'w-full rounded-md border px-3 py-2 text-sm leading-5 font-sans whitespace-pre-wrap break-words overflow-y-auto [scrollbar-gutter:stable]'

export function HighlightedTextField({
  index,
  value,
  highlights,
  disabled,
  highlightUnavailable = false,
  highlightShortcut = DEFAULT_HIGHLIGHT_SHORTCUT,
  onValueChange,
  onHighlightsChange,
  onSubmitShortcut,
}: HighlightedTextFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const shortcutLabel = describeHighlightShortcut(highlightShortcut)
  const full = highlights.length >= KNOWLEDGE_HIGHLIGHTS_MAX

  function highlightSelection() {
    const textarea = textareaRef.current

    if (!textarea) {
      return
    }

    if (highlightUnavailable) {
      return
    }

    onHighlightsChange(addHighlight(highlights, { start: textarea.selectionStart, end: textarea.selectionEnd }, value.length))
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      onSubmitShortcut()

      return
    }

    if (matchesHighlightShortcut(event, highlightShortcut)) {
      event.preventDefault()
      highlightSelection()
    }
  }

  function syncScroll() {
    if (layerRef.current && textareaRef.current) {
      layerRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-md bg-white shadow-sm">
        <div
          ref={layerRef}
          aria-hidden="true"
          data-testid={`knowledge-highlight-layer-${index}`}
          className={`${sharedBox} pointer-events-none absolute inset-0 border-transparent text-transparent`}
        >
          {highlightSegments(value, highlights).map((segment, i) =>
            segment.marked ? (
              <mark key={i} className="rounded-sm bg-yellow-200 text-transparent">
                {segment.text}
              </mark>
            ) : (
              <span key={i}>{segment.text}</span>
            ),
          )}
          {'\n'}
        </div>

        <textarea
          ref={textareaRef}
          aria-label={`Text to learn from, block ${index + 1}`}
          value={value}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={onKeyDown}
          onScroll={syncScroll}
          placeholder="Paste a block of prose to learn from…"
          rows={6}
          data-testid={`knowledge-block-input-${index}`}
          className={`${sharedBox} relative resize-none border-neutral-500 bg-transparent text-neutral-900 outline-none placeholder:text-neutral-500 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20 disabled:opacity-70`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || full || highlightUnavailable}
          onClick={highlightSelection}
          title={`${shortcutLabel} also highlights the selection`}
          aria-keyshortcuts={shortcutLabel.replace('Cmd', 'Meta').replace('Ctrl', 'Control')}
          data-testid={`knowledge-highlight-button-${index}`}
          className="inline-flex min-h-[44px] items-center rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 sm:min-h-0"
        >
          Highlight selection
        </button>

        {highlights.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onHighlightsChange([])}
            data-testid={`knowledge-highlights-clear-${index}`}
            className="text-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
          >
            Clear highlights
          </button>
        )}

        {highlightUnavailable && (
          <span data-testid={`knowledge-highlight-hint-${index}`} className="text-sm text-neutral-500">
            Highlights work with a single text block.
          </span>
        )}

        {full && <span className="text-sm text-neutral-500">Up to {KNOWLEDGE_HIGHLIGHTS_MAX} highlights.</span>}
      </div>

      {highlights.length > 0 && (
        <ul aria-label={`Highlights, block ${index + 1}`} className="flex flex-wrap gap-2">
          {highlights.map((range, i) => {
            const excerpt = highlightExcerpt(value, range)

            return (
              <li
                key={`${range.start}-${range.end}`}
                data-testid={`knowledge-highlight-chip-${index}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-sm text-neutral-800"
              >
                <span>{excerpt}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove highlight: ${excerpt}`}
                  onClick={() => onHighlightsChange(highlights.filter((_, j) => j !== i))}
                  data-testid={`knowledge-highlight-remove-${index}-${i}`}
                  className="text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
