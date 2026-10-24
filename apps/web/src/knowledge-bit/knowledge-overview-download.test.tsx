// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { KnowledgeOverviewDownload } from './knowledge-overview-download'

afterEach(cleanup)

describe('KnowledgeOverviewDownload', () => {
  it('should offer the learner a JSON and a CSV download of all their cards', () => {
    render(<KnowledgeOverviewDownload />)

    expect(screen.getByText('Download my cards:')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'JSON' }).getAttribute('href')).toBe(
      '/api/knowledge-bits/export?format=json',
    )
    expect(screen.getByRole('link', { name: 'CSV' }).getAttribute('href')).toBe(
      '/api/knowledge-bits/export?format=csv',
    )
  })
})
