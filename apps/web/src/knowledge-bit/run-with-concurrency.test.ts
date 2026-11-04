import { describe, expect, it } from 'vitest'

import { runWithConcurrency } from './run-with-concurrency'

describe('runWithConcurrency', () => {
  it('should never run more restores at once than the cap and still finish every card', async () => {
    let active = 0
    let peak = 0

    const results = await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1

      return n * 2
    })

    expect(peak).toBe(3)
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14])
  })

  it('should return nothing for an empty selection', async () => {
    expect(await runWithConcurrency([], 3, async (n: number) => n)).toEqual([])
  })
})
