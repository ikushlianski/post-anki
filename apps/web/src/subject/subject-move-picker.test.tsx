// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { SubjectMovePicker, type SubjectMovePickerProps } from './subject-move-picker'
import { buildMoveOptions, type MoveOption } from './subject-menu-model'
import type { Subject } from '../curriculum/model'

afterEach(() => {
  cleanup()
})

function subject(id: string, name: string, parentId: string | null): Subject {
  return { id, name, kind: 'architecture-mentor', requireSources: false, modelTier: null, parentId }
}

function manySubjects(count: number): Subject[] {
  return Array.from({ length: count }, (_, index) => subject(`s${index}`, `Topic ${index}`, null))
}

function renderPicker(overrides: Partial<SubjectMovePickerProps> & { options: MoveOption[] }) {
  const props: SubjectMovePickerProps = {
    currentParentId: null,
    busy: false,
    error: null,
    emptyNotice: 'No other subjects yet.',
    testIds: {
      top: 'move-top',
      target: (parentId) => `move-target-${parentId}`,
      filter: 'move-filter',
    },
    onMove: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }

  render(<SubjectMovePicker {...props} />)

  return props
}

describe('SubjectMovePicker', () => {
  it('should mark the current parent and show the nesting with indentation', () => {
    const options = buildMoveOptions(
      'sales',
      'health',
      [
        subject('business', 'Business', null),
        subject('sales', 'Sales', 'business'),
        subject('health', 'Health', null),
        subject('fitness', 'Fitness', 'health'),
      ],
    )

    renderPicker({ options, currentParentId: 'health' })

    expect(screen.getByTestId('move-target-health').textContent).toBe('Health (current)')
    expect(screen.getByTestId('move-target-health').hasAttribute('disabled')).toBe(true)

    const fitness = screen.getByTestId('move-target-fitness')

    expect(fitness.textContent).toBe('Fitness')
    expect(fitness.getAttribute('style')).toContain('1.5rem')
  })

  it('should mark Top level as current when the subject has no parent', () => {
    renderPicker({ options: [], currentParentId: null })

    expect(screen.getByTestId('move-top').textContent).toBe('Top level (current)')
  })

  it('should show the filter field only when there are more than eight options', () => {
    const { unmount } = render(
      <SubjectMovePicker
        options={buildMoveOptions('x', null, manySubjects(8))}
        currentParentId={null}
        busy={false}
        error={null}
        emptyNotice=""
        testIds={{ top: 'top', target: (id) => id }}
        onMove={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Filter subjects')).toBeNull()
    unmount()

    renderPicker({ options: buildMoveOptions('x', null, manySubjects(9)) })

    expect(screen.getByLabelText('Filter subjects')).toBeTruthy()
  })

  it('should narrow the options to matching paths when the filter has text', () => {
    const options = buildMoveOptions(
      'x',
      null,
      [
        subject('health', 'Health', null),
        subject('fitness', 'Fitness', 'health'),
        ...manySubjects(8),
      ],
    )

    renderPicker({ options })

    fireEvent.change(screen.getByLabelText('Filter subjects'), { target: { value: 'fit' } })

    const list = screen.getByTestId('move-top').parentElement as HTMLElement

    expect(within(list).getByTestId('move-target-fitness').textContent).toBe('Health › Fitness')
    expect(screen.queryByTestId('move-target-s0')).toBeNull()
  })

  it('should say when the filter matches nothing', () => {
    renderPicker({ options: buildMoveOptions('x', null, manySubjects(9)) })

    fireEvent.change(screen.getByLabelText('Filter subjects'), { target: { value: 'zzz' } })

    expect(screen.getByText('No subjects match “zzz”.')).toBeTruthy()
  })

  it('should call onMove with the chosen parent and null for Top level', () => {
    const { onMove } = renderPicker({
      options: buildMoveOptions('x', 'elsewhere', [subject('health', 'Health', null)]),
      currentParentId: 'elsewhere',
    })

    fireEvent.click(screen.getByTestId('move-target-health'))
    fireEvent.click(screen.getByTestId('move-top'))

    expect(vi.mocked(onMove).mock.calls).toEqual([['health'], [null]])
  })

  it('should show the empty notice when there is nothing to move under', () => {
    renderPicker({ options: [], emptyNotice: 'Loading subjects…' })

    expect(screen.getByText('Loading subjects…')).toBeTruthy()
  })
})
