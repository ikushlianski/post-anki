// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { StudyMaterial } from '@post-anki/shared'

import { StudyMaterialItem } from './study-material-item'

function readyMaterial(overrides: Partial<StudyMaterial> = {}): StudyMaterial {
  return {
    id: 'mat_1',
    topicId: 'top_1',
    kind: 'worked_example',
    status: 'ready',
    body: 'Here is a worked example.',
    citations: [{ title: 'Example source', url: 'https://example.com/a' }],
    failureReason: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('StudyMaterialItem.citationLinks', () => {
  afterEach(cleanup)

  it('never turns an unsafe citation url into a clickable href', () => {
    render(
      <StudyMaterialItem
        material={readyMaterial({
          citations: [{ title: 'Malicious source', url: 'javascript:alert(1)' }],
        })}
      />,
    )

    const link = screen.getByTestId('study-material-citation').querySelector('a')

    expect(link?.hasAttribute('href')).toBe(false)
  })

  it('keeps a genuinely safe citation url clickable', () => {
    render(<StudyMaterialItem material={readyMaterial()} />)

    const link = screen.getByTestId('study-material-citation').querySelector('a')

    expect(link?.getAttribute('href')).toBe('https://example.com/a')
  })
})
