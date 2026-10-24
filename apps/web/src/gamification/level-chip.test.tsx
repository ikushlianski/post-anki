// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { GamificationProfile } from '@post-anki/shared'

vi.mock('./gamification.api')

import { getGamificationProfile } from './gamification.api'
import { LevelChip } from './level-chip'

const profile: GamificationProfile = {
  player: { level: 2, totalPoints: 130, pointsIntoLevel: 30, pointsForNextLevel: 200 },
  todayPoints: 10,
  streak: { current: 1, longest: 3 },
  masteredCards: 0,
  badges: [],
}

function renderChip() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <LevelChip />
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('LevelChip', () => {
  it('should show the current level and how many points are left to the next one', async () => {
    vi.mocked(getGamificationProfile).mockResolvedValue(profile)
    renderChip()

    const chip = await screen.findByTestId('level-chip')

    expect(chip.textContent).toContain('Level 2')
    expect(chip.textContent).toContain('170 points to level 3')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('15')
  })

  it('should welcome a brand new player at level 1 with no points', async () => {
    vi.mocked(getGamificationProfile).mockResolvedValue({
      ...profile,
      player: { level: 1, totalPoints: 0, pointsIntoLevel: 0, pointsForNextLevel: 100 },
    })
    renderChip()

    const chip = await screen.findByTestId('level-chip')

    expect(chip.textContent).toContain('Level 1')
    expect(chip.textContent).toContain('first points arrive with your first review')
  })

  it('should show nothing when the profile cannot be loaded', async () => {
    vi.mocked(getGamificationProfile).mockResolvedValue(null)
    renderChip()

    await vi.waitFor(() => expect(getGamificationProfile).toHaveBeenCalled())

    expect(screen.queryByTestId('level-chip')).toBeNull()
  })
})
