// @vitest-environment jsdom
import { fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { resolveFocusKey, useFocusKeyboard } from './knowledge-bit-focus-keyboard'

function press(key: string, overrides: Partial<Parameters<typeof resolveFocusKey>[0]> = {}) {
  return resolveFocusKey({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: null,
    ...overrides,
  })
}

describe('resolveFocusKey', () => {
  it('should approve with a', () => {
    expect(press('a')).toBe('approve')
  })

  it('should reject with r or x', () => {
    expect(press('r')).toBe('reject')
    expect(press('x')).toBe('reject')
  })

  it('should undo with z', () => {
    expect(press('z')).toBe('undo')
  })

  it('should send the item to the Inbox with c and ask for an AI example with e', () => {
    expect(press('c')).toBe('chat')
    expect(press('i')).toBe('inbox')
    expect(press('e')).toBe('example')
  })

  it('should leave ArrowUp and ArrowDown alone on ordinary cards so they keep scrolling', () => {
    expect(press('ArrowUp')).toBeNull()
    expect(press('ArrowDown')).toBeNull()
  })

  it('should not approve or reject with ArrowRight and ArrowLeft', () => {
    expect(press('ArrowRight')).toBeNull()
    expect(press('ArrowLeft')).toBeNull()
  })

  it('should cycle variations with ArrowLeft and ArrowRight only when the card offers options', () => {
    const base = { ctrlKey: false, metaKey: false, altKey: false, target: null }

    expect(resolveFocusKey({ key: 'ArrowLeft', ...base }, true)).toBe('option-prev')
    expect(resolveFocusKey({ key: 'ArrowRight', ...base }, true)).toBe('option-next')
  })

  it('should move the highlight with ArrowUp and ArrowDown only when the card offers options', () => {
    expect(resolveFocusKey({ key: 'ArrowUp', ctrlKey: false, metaKey: false, altKey: false, target: null }, true)).toBe(
      'option-prev',
    )
    expect(resolveFocusKey({ key: 'ArrowDown', ctrlKey: false, metaKey: false, altKey: false, target: null }, true)).toBe(
      'option-next',
    )
  })

  it('should approve with Return unless Return is pressed on a button, link or summary', () => {
    expect(press('Enter')).toBe('approve')
    expect(press('Enter', { target: document.createElement('button') })).toBeNull()
    expect(press('Enter', { target: document.createElement('a') })).toBeNull()
    expect(press('Enter', { target: document.createElement('summary') })).toBeNull()
    expect(press('Enter', { target: document.createElement('textarea') })).toBeNull()
  })

  it('should not trigger chat or example while typing in a note field', () => {
    const field = document.createElement('textarea')

    expect(press('c', { target: field })).toBeNull()
    expect(press('e', { target: field })).toBeNull()
  })

  it('should ignore the old review shortcuts so no hidden card is decided', () => {
    expect(press('1')).toBeNull()
    expect(press('A', { shiftKey: true })).toBeNull()
  })

  it('should ignore a held key so one press decides one card', () => {
    expect(press('ArrowDown', { repeat: true })).toBeNull()
  })

  it('should ignore keys with a modifier', () => {
    expect(press('a', { metaKey: true })).toBeNull()
    expect(press('r', { ctrlKey: true })).toBeNull()
    expect(press('z', { altKey: true })).toBeNull()
  })

  it('should ignore keys typed into a field', () => {
    const input = document.createElement('input')

    expect(press('a', { target: input })).toBeNull()
    expect(press('ArrowLeft', { target: input })).toBeNull()
  })
})

describe('useFocusKeyboard', () => {
  it('should call the handler for a decision key when enabled', () => {
    const onAction = vi.fn()

    renderHook(() => useFocusKeyboard(onAction, true))
    fireEvent.keyDown(window, { key: 'a' })

    expect(onAction).toHaveBeenCalledWith('approve')
  })

  it('should keep arrow scrolling on ordinary cards and take over only when options exist', () => {
    const onAction = vi.fn()
    const { rerender } = renderHook(({ options }) => useFocusKeyboard(onAction, true, options), {
      initialProps: { options: false },
    })

    expect(fireEvent.keyDown(window, { key: 'ArrowDown' })).toBe(true)
    expect(onAction).not.toHaveBeenCalled()

    rerender({ options: true })

    expect(fireEvent.keyDown(window, { key: 'ArrowDown' })).toBe(false)
    expect(onAction).toHaveBeenCalledWith('option-next')
  })

  it('should do nothing while disabled', () => {
    const onAction = vi.fn()

    renderHook(() => useFocusKeyboard(onAction, false))
    fireEvent.keyDown(window, { key: 'a' })

    expect(onAction).not.toHaveBeenCalled()
  })

  it('should decide once for a held key', () => {
    const onAction = vi.fn()

    renderHook(() => useFocusKeyboard(onAction, true))
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.keyDown(window, { key: 'a', repeat: true })

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('should leave the field on Escape so arrow keys decide again', () => {
    const onAction = vi.fn()
    const input = document.createElement('input')

    document.body.appendChild(input)
    input.focus()
    renderHook(() => useFocusKeyboard(onAction, true))
    fireEvent.keyDown(input, { key: 'a' })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onAction).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(input)

    fireEvent.keyDown(document.body, { key: 'a' })

    expect(onAction).toHaveBeenCalledWith('approve')
    input.remove()
  })
})
