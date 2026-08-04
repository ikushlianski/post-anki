import { describe, it, expect } from 'vitest'
import { domainMasteryColor } from './domain-mastery-color'

// visual-knowledge-map (issue #86), SCENARIO 2 — color is the ENTIRE
// mechanism by which a user tells "gap" from "progress" at a glance, so the
// percent === 0 vs. percent > 0 hard boundary gets a real, named unit test
// (found during red-team review to need this, not a smoke check).
describe('domainMasteryColor', () => {
  it('renders a gap node in the fixed rose class regardless of status/percent mismatch', () => {
    expect(domainMasteryColor('gap', 0)).toBe('bg-rose-100 text-rose-700 border-rose-300')
  })

  it('renders a barely-started node on the progress side, distinct from the gap class', () => {
    const color = domainMasteryColor('progress', 1)

    expect(color).not.toBe(domainMasteryColor('gap', 0))
    expect(color).toContain('emerald')
  })

  it('renders a fully-mastered node on the progress side, distinct from the gap class', () => {
    const color = domainMasteryColor('progress', 100)

    expect(color).not.toBe(domainMasteryColor('gap', 0))
    expect(color).toContain('emerald')
  })

  it('renders a barely-started node and a fully-mastered node at visibly different points on the gradient', () => {
    expect(domainMasteryColor('progress', 1)).not.toBe(domainMasteryColor('progress', 100))
  })

  it('is monotonically distinct across the gradient buckets', () => {
    const colors = [10, 30, 60, 90, 100].map((percent) => domainMasteryColor('progress', percent))

    expect(new Set(colors).size).toBe(colors.length)
  })
})
