// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SubjectHierarchyRow } from '@post-anki/core'

import { pickSearchableOption } from '../ui/searchable-select-test-utils'
import { NotionSourceForm } from './notion-source-form'

const subjects = [
  { id: 'eng', name: 'English', parentId: null },
  { id: 'eng-it', name: 'English for IT', parentId: 'eng' },
] as unknown as SubjectHierarchyRow[]

const PAGE = 'https://www.notion.so/Phrases-0123456789abcdef0123456789abcdef'

afterEach(cleanup)

function fillValid() {
  fireEvent.change(screen.getByTestId('notion-source-name'), { target: { value: 'Phrases' } })
  fireEvent.change(screen.getByTestId('notion-source-url'), { target: { value: PAGE } })
  pickSearchableOption('notion-source-subject', 'eng-it')
}

function renderForm(onSubmit = vi.fn()) {
  render(
    <NotionSourceForm subjects={subjects} busy={false} errorText={null} onSubmit={onSubmit} onCancel={vi.fn()} />,
  )

  return onSubmit
}

describe('NotionSourceForm', () => {
  it('should keep the remove-from-Notion switch off by default and explain what it does', () => {
    renderForm()

    const toggle = screen.getByTestId('notion-source-remove-toggle')

    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Remove imported items from Notion')).toBeTruthy()
    expect(screen.getByText(/only\s+removed after a successful import/)).toBeTruthy()
    expect(screen.getByText(/blocks with nested content are never removed/)).toBeTruthy()
  })

  it('should send removal as off when the learner never touched the switch', () => {
    const onSubmit = renderForm()

    fillValid()
    fireEvent.click(screen.getByTestId('notion-source-save'))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Phrases',
      pageUrl: PAGE,
      subjectId: 'eng-it',
      itemsPerRun: 10,
      frequency: 'manual',
      removeAfterImport: false,
    })
  })

  it('should send removal as on only after the learner turns it on', () => {
    const onSubmit = renderForm()

    fillValid()
    fireEvent.click(screen.getByTestId('notion-source-remove-toggle'))
    fireEvent.change(screen.getByTestId('notion-source-frequency'), { target: { value: 'nightly' } })
    fireEvent.click(screen.getByTestId('notion-source-save'))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ removeAfterImport: true, frequency: 'nightly' }),
    )
  })

  it('should not save a source without a Notion link, a subject or a valid item count', () => {
    const onSubmit = renderForm()

    fireEvent.change(screen.getByTestId('notion-source-name'), { target: { value: 'Phrases' } })
    fireEvent.change(screen.getByTestId('notion-source-url'), { target: { value: 'https://example.com/x' } })
    fireEvent.change(screen.getByTestId('notion-source-items-per-run'), { target: { value: '500' } })
    fireEvent.click(screen.getByTestId('notion-source-save'))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getAllByRole('alert')).toHaveLength(3)
  })

  it('should list only sub-subjects until the learner asks for parents too', () => {
    renderForm()

    fireEvent.click(screen.getByTestId('notion-source-subject'))

    expect(screen.queryByTestId('notion-source-subject-option-eng')).toBeNull()
    expect(screen.getByTestId('notion-source-subject-option-eng-it')).toBeTruthy()
  })
})
