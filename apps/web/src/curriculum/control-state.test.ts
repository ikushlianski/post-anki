import { describe, it, expect } from 'vitest'

import { isTagControlDisabled, tagControlHint, tagControlState } from './tag-control-state'

describe('tagControlState', () => {
  it('hides the controls entirely on a non-editable curriculum', () => {
    expect(tagControlState({ editable: false, hydrated: false, busy: false })).toBe('hidden')
    expect(tagControlState({ editable: false, hydrated: true, busy: true })).toBe('hidden')
  })

  it('reports "preparing" while the server-rendered control has not hydrated yet', () => {
    expect(tagControlState({ editable: true, hydrated: false, busy: false })).toBe('preparing')
  })

  it('keeps "preparing" ahead of "busy" so a not-yet-wired control never claims to be working', () => {
    expect(tagControlState({ editable: true, hydrated: false, busy: true })).toBe('preparing')
  })

  it('reports "busy" once hydrated and a mutation is in flight', () => {
    expect(tagControlState({ editable: true, hydrated: true, busy: true })).toBe('busy')
  })

  it('reports "ready" only when the control is editable, hydrated and idle', () => {
    expect(tagControlState({ editable: true, hydrated: true, busy: false })).toBe('ready')
  })
})

describe('isTagControlDisabled', () => {
  it('leaves only a fully ready control clickable', () => {
    expect(isTagControlDisabled('ready')).toBe(false)
  })

  it('disables a control that has not hydrated, so an early click is never silently swallowed', () => {
    expect(isTagControlDisabled('preparing')).toBe(true)
  })

  it('disables hidden and busy controls too', () => {
    expect(isTagControlDisabled('hidden')).toBe(true)
    expect(isTagControlDisabled('busy')).toBe(true)
  })
})

describe('tagControlHint', () => {
  it('explains why a not-yet-hydrated control cannot be used', () => {
    expect(tagControlHint('preparing')).toBe('Still loading — this control is not ready yet')
  })

  it('adds no hint to any other state', () => {
    expect(tagControlHint('ready')).toBeUndefined()
    expect(tagControlHint('busy')).toBeUndefined()
    expect(tagControlHint('hidden')).toBeUndefined()
  })
})
