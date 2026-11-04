// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { NotesSearchForm } from './notes-search-form'

afterEach(cleanup)

describe('NotesSearchForm', () => {
  it('should give the search box and concern select accessible names', () => {
    render(
      <NotesSearchForm
        subjects={[]}
        selectedSubjectId=""
        onSubjectChange={vi.fn()}
        domainNodeOptions={[]}
        onSearch={vi.fn()}
        busy={false}
      />,
    )

    expect(screen.getByLabelText('Search your notes')).toBeTruthy()
    expect(screen.getByLabelText('Concern')).toBeTruthy()
  })
})
