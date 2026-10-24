// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { GamificationProfile } from '@post-anki/shared'

import { ProfileView } from './profile-view'

const profile: GamificationProfile = {
  player: { level: 3, totalPoints: 340, pointsIntoLevel: 40, pointsForNextLevel: 300 },
  todayPoints: 8,
  streak: { current: 1, longest: 9 },
  masteredCards: 4,
  badges: [
    {
      key: 'streak-7',
      family: 'streak',
      name: 'One week',
      description: 'Study 7 days in a row',
      threshold: 7,
      progress: 9,
      unlocked: true,
    },
  ],
}

afterEach(cleanup)

describe('ProfileView', () => {
  it('should greet a new player with a friendly empty state', () => {
    render(
      <ProfileView
        profile={{
          ...profile,
          player: { level: 1, totalPoints: 0, pointsIntoLevel: 0, pointsForNextLevel: 100 },
          todayPoints: 0,
          badges: [],
        }}
      />,
    )

    expect(screen.getByTestId('profile-level').textContent).toContain('Level 1')
    expect(screen.getByTestId('profile-level').textContent).toContain('You are at the start')
    expect(screen.getByText('No badges yet.')).toBeTruthy()
  })


  it('should show level, points, streaks, learned cards and badges', () => {
    render(<ProfileView profile={profile} />)

    expect(screen.getByTestId('profile-level').textContent).toContain('Level 3')
    expect(screen.getByTestId('profile-total-points').textContent).toBe('340')
    expect(screen.getByTestId('profile-points-today').textContent).toBe('8')
    expect(screen.getByTestId('profile-current-streak').textContent).toBe('1 day')
    expect(screen.getByTestId('profile-longest-streak').textContent).toBe('9 days')
    expect(screen.getByTestId('profile-cards-well-learned').textContent).toBe('4')
    expect(screen.getByTestId('badge-streak-7')).toBeTruthy()
  })
})
