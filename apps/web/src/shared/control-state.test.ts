import { describe, it, expect } from 'vitest'

import { isControlDisabled, controlHint, controlState } from './control-state'

describe('controlState', () => {
  it('hides the controls entirely on a non-editable curriculum', () => {
    expect(controlState({ editable: false, hydrated: false, busy: false })).toBe('hidden')
    expect(controlState({ editable: false, hydrated: true, busy: true })).toBe('hidden')
  })

  it('reports "preparing" while the server-rendered control has not hydrated yet', () => {
    expect(controlState({ editable: true, hydrated: false, busy: false })).toBe('preparing')
  })

  it('keeps "preparing" ahead of "busy" so a not-yet-wired control never claims to be working', () => {
    expect(controlState({ editable: true, hydrated: false, busy: true })).toBe('preparing')
  })

  it('reports "busy" once hydrated and a mutation is in flight', () => {
    expect(controlState({ editable: true, hydrated: true, busy: true })).toBe('busy')
  })

  it('reports "ready" only when the control is editable, hydrated and idle', () => {
    expect(controlState({ editable: true, hydrated: true, busy: false })).toBe('ready')
  })
})

describe('isControlDisabled', () => {
  it('leaves only a fully ready control clickable', () => {
    expect(isControlDisabled('ready')).toBe(false)
  })

  it('disables a control that has not hydrated, so an early click is never silently swallowed', () => {
    expect(isControlDisabled('preparing')).toBe(true)
  })

  it('disables hidden and busy controls too', () => {
    expect(isControlDisabled('hidden')).toBe(true)
    expect(isControlDisabled('busy')).toBe(true)
  })
})

describe('controlHint', () => {
  it('explains why a not-yet-hydrated control cannot be used', () => {
    expect(controlHint('preparing')).toBe('Still loading — this control is not ready yet')
  })

  it('adds no hint to any other state', () => {
    expect(controlHint('ready')).toBeUndefined()
    expect(controlHint('busy')).toBeUndefined()
    expect(controlHint('hidden')).toBeUndefined()
  })
})
