// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { SHORT_TEXT_HINT_MESSAGE, SHORT_TEXT_HINT_THRESHOLD } from '@post-anki/shared'

import { KnowledgeBlockList } from './knowledge-block-list'
import type { Block } from './knowledge-form-blocks'

function renderList(block: Block) {
  render(
    <KnowledgeBlockList
      blocks={[block]}
      showTargetPhrases={false}
      busy={false}
      duplicates={{}}
      blockReasons={{}}
      onValueChange={vi.fn()}
      onTypeChange={vi.fn()}
      onTargetPhrasesChange={vi.fn()}
      onHighlightsChange={vi.fn()}
      onRemove={vi.fn()}
      onAddAgain={vi.fn()}
      onSubmitShortcut={vi.fn()}
    />,
  )
}

describe('short text hint', () => {
  afterEach(cleanup)

  it('should warn politely when a short note is pasted', () => {
    renderList({ type: 'text', value: 'just a line' })

    const hint = screen.getByTestId('knowledge-short-text-hint-0')

    expect(hint.textContent).toBe(SHORT_TEXT_HINT_MESSAGE)
    expect(hint.getAttribute('aria-live')).toBe('polite')
  })

  it('should show nothing when the field is empty', () => {
    renderList({ type: 'text', value: '   ' })

    expect(screen.getByTestId('knowledge-short-text-hint-0').textContent).toBe('')
  })

  it('should stop warning once the text reaches the threshold', () => {
    renderList({ type: 'text', value: 'a'.repeat(SHORT_TEXT_HINT_THRESHOLD) })

    expect(screen.getByTestId('knowledge-short-text-hint-0').textContent).toBe('')
  })

  it('should not warn for links', () => {
    renderList({ type: 'url', value: 'https://a.io' })

    expect(screen.queryByTestId('knowledge-short-text-hint-0')).toBeNull()
  })

  it('should leave the text field enabled so submit is never blocked', () => {
    renderList({ type: 'text', value: 'short' })

    expect(screen.getByTestId('knowledge-block-input-0').hasAttribute('disabled')).toBe(false)
  })
})
