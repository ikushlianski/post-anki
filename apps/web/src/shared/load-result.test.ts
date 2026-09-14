import { describe, expect, it } from 'vitest'
import { settle } from './load-result'

describe('settle', () => {
  it('captures a resolved value as ok', async () => {
    const result = await settle(Promise.resolve(['a', 'b']))

    expect(result).toEqual({ ok: true, data: ['a', 'b'] })
  })

  it('captures a rejected value as a failure instead of throwing', async () => {
    const result = await settle<string[]>(Promise.reject(new Error('network down')))

    expect(result).toEqual({ ok: false })
  })
})
