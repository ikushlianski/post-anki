// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { SearchableSelect, type SearchableOption } from './searchable-select'

const OPTIONS: SearchableOption[] = [
  { id: 'a', label: 'Alpha', group: 'First', detail: '$1' },
  { id: 'b', label: 'Beta', group: 'First', note: 'Second note' },
  { id: 'c', label: 'Gamma', group: 'Second', badge: 'Suggested' },
  { id: 'd', label: 'Delta', group: 'Second', disabledReason: 'Retired 2026-01-01' },
]

function Harness({ options = OPTIONS, clearable = false }: { options?: SearchableOption[]; clearable?: boolean }) {
  const [value, setValue] = useState('')

  return (
    <>
      <SearchableSelect
        options={options}
        value={value}
        onChange={setValue}
        ariaLabel="Pick"
        testId="pick"
        clearable={clearable}
      />
      <output data-testid="chosen">{value}</output>
    </>
  )
}

function input(): HTMLInputElement {
  return screen.getByTestId('pick') as HTMLInputElement
}

function chosen(): string {
  return screen.getByTestId('chosen').textContent ?? ''
}

describe('SearchableSelect', () => {
  afterEach(() => {
    cleanup()
  })

  it('should show nothing chosen and a closed list until the user interacts', () => {
    render(<Harness />)

    expect(input().value).toBe('')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input().getAttribute('aria-expanded')).toBe('false')
  })

  it('should open a listbox of options when the field is clicked', () => {
    render(<Harness />)
    fireEvent.click(input())

    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getAllByRole('option')).toHaveLength(4)
    expect(input().getAttribute('aria-expanded')).toBe('true')
  })

  it('should narrow the list as the user types and ignore case', () => {
    render(<Harness />)
    fireEvent.change(input(), { target: { value: 'GAM' } })

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['GammaSuggested'])
  })

  it('should also match the group name so a vendor can be searched', () => {
    render(<Harness />)
    fireEvent.change(input(), { target: { value: 'second' } })

    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('should say clearly that nothing matches instead of showing an empty box', () => {
    render(<Harness />)
    fireEvent.change(input(), { target: { value: 'zzz' } })

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByTestId('pick-empty').textContent).toBe('Nothing matches your search')
  })

  it('should show a heading once per group', () => {
    render(<Harness />)
    fireEvent.click(input())

    expect(screen.getAllByText('First')).toHaveLength(1)
    expect(screen.getAllByText('Second')).toHaveLength(1)
  })

  it('should choose with the keyboard: down, down, enter', () => {
    render(<Harness />)
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })

    expect(chosen()).toBe('b')
    expect(input().value).toBe('Beta')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('should move the active option with aria-activedescendant', () => {
    render(<Harness />)
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })

    const activeId = input().getAttribute('aria-activedescendant')

    expect(document.getElementById(activeId ?? '')?.textContent).toContain('Beta')
  })

  it('should close and keep the old choice when Escape is pressed', () => {
    render(<Harness />)
    fireEvent.change(input(), { target: { value: 'alp' } })
    fireEvent.keyDown(input(), { key: 'Escape' })

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(chosen()).toBe('')
    expect(input().value).toBe('')
  })

  it('should choose an option clicked with the mouse', () => {
    render(<Harness />)
    fireEvent.click(input())
    fireEvent.mouseDown(screen.getByTestId('pick-option-c'))

    expect(chosen()).toBe('c')
  })

  it('should skip a disabled option with the arrow keys and explain why it is disabled', () => {
    render(<Harness />)
    fireEvent.click(input())

    expect(screen.getByTestId('pick-option-d').textContent).toContain('Retired 2026-01-01')

    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })

    expect(chosen()).toBe('c')
  })

  it('should not choose a disabled option on click', () => {
    render(<Harness />)
    fireEvent.click(input())
    fireEvent.mouseDown(screen.getByTestId('pick-option-d'))

    expect(chosen()).toBe('')
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('should keep a selected subject until the user empties the field when clearable', () => {
    render(<Harness clearable />)
    fireEvent.click(input())
    fireEvent.mouseDown(screen.getByTestId('pick-option-a'))
    fireEvent.click(input())
    fireEvent.blur(input())

    expect(chosen()).toBe('a')

    fireEvent.change(input(), { target: { value: '' } })
    fireEvent.blur(input())

    expect(chosen()).toBe('')
  })

  it('should keep rows at least 44px tall on phones', () => {
    render(<Harness />)
    fireEvent.click(input())

    expect(screen.getByTestId('pick-option-a').className).toContain('min-h-[44px]')
    expect(screen.getByTestId('pick-option-a').className).toContain('sm:min-h-9')
    expect(input().className).toContain('min-h-[44px]')
    expect(input().className).toContain('sm:min-h-0')
  })
})
