import { describe, expect, it } from 'vitest'

import { resolveScheduleTarget } from './schedule-target'

describe('resolveScheduleTarget', () => {
  it('resolves "anything" to a null target regardless of any stray id', () => {
    expect(resolveScheduleTarget({ kind: 'anything', id: 'ignored' })).toEqual({
      targetType: null,
      targetId: null,
    })
  })

  it('resolves a curriculum selection to its target type and id', () => {
    expect(resolveScheduleTarget({ kind: 'curriculum', id: 'curr-1' })).toEqual({
      targetType: 'curriculum',
      targetId: 'curr-1',
    })
  })

  it('resolves a learning path selection to its target type and id', () => {
    expect(resolveScheduleTarget({ kind: 'learning_path', id: 'path-1' })).toEqual({
      targetType: 'learning_path',
      targetId: 'path-1',
    })
  })

  it('falls back to "anything" when a scoped kind has no id selected yet', () => {
    expect(resolveScheduleTarget({ kind: 'curriculum', id: null })).toEqual({
      targetType: null,
      targetId: null,
    })
  })
})
