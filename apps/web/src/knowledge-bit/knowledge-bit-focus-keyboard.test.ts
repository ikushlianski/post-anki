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
  it('should approve with ArrowRight or a', () => {
    expect(press('ArrowRight')).toBe('approve')
    expect(press('a')).toBe('approve')
  })

  it('should reject with ArrowLeft, r or x', () => {
    expect(press('ArrowLeft')).toBe('reject')
    expect(press('r')).toBe('reject')
    expect(press('x')).toBe('reject')
  })

  it('should undo with z', () => {
    expect(press('z')).toBe('undo')
  })

  it('should ignore the old review shortcuts so no hidden card is decided', () => {
    expect(press('Enter')).toBeNull()
    expect(press('1')).toBeNull()
    expect(press('A', { shiftKey: true })).toBeNull()
  })

  it('should ignore a held key so one press decides one card', () => {
    expect(press('ArrowRight', { repeat: true })).toBeNull()
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
    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(onAction).toHaveBeenCalledWith('approve')
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

    fireEvent.keyDown(document.body, { key: 'ArrowRight' })

    expect(onAction).toHaveBeenCalledWith('approve')
    input.remove()
  })
})
