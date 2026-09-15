// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { Source } from '../curriculum/model'
import { SourceRow } from './curriculum.$curriculumId'

function linkSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 'src_1',
    curriculumId: 'cur_1',
    kind: 'link',
    value: 'https://example.com/docs',
    approvalStatus: 'approved',
    discoveryTier: null,
    ...overrides,
  }
}

describe('SourceRow', () => {
  afterEach(cleanup)

  it('never turns an unsafe source url into a clickable href', () => {
    render(<SourceRow source={linkSource({ value: 'javascript:alert(1)' })} />)

    const link = screen.getByText('javascript:alert(1)').closest('a')

    expect(link?.hasAttribute('href')).toBe(false)
  })

  it('keeps a genuinely safe source url clickable', () => {
    render(<SourceRow source={linkSource({ value: 'https://example.com/docs' })} />)

    const link = screen.getByText('https://example.com/docs').closest('a')

    expect(link?.getAttribute('href')).toBe('https://example.com/docs')
  })
})
