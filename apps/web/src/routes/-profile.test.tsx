// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { GamificationProfile } from '@post-anki/shared'

const loaderData = vi.hoisted(() => ({ current: { profile: null as unknown } }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  createFileRoute: () => (config: { component: () => ReactNode; loader: () => Promise<unknown> }) => ({
    useLoaderData: () => loaderData.current,
    component: config.component,
    loader: config.loader,
  }),
}))

vi.mock('../gamification/gamification.api')

import { getGamificationProfile } from '../gamification/gamification.api'
import { Route } from './profile'

const profile: GamificationProfile = {
  player: { level: 1, totalPoints: 20, pointsIntoLevel: 20, pointsForNextLevel: 100 },
  todayPoints: 5,
  streak: { current: 2, longest: 2 },
  masteredCards: 0,
  badges: [],
}

const Page = (Route as unknown as { component: () => ReactNode }).component

afterEach(cleanup)

describe('profile route', () => {
  it('should load the profile and show the player level', async () => {
    vi.mocked(getGamificationProfile).mockResolvedValue(profile)

    const loader = (Route as unknown as { loader: () => Promise<{ profile: unknown }> }).loader

    loaderData.current = await loader()
    render(<Page />)

    expect(screen.getByTestId('profile-level').textContent).toContain('Level 1')
  })

  it('should say the profile could not be loaded when the request failed', () => {
    loaderData.current = { profile: null }
    render(<Page />)

    expect(screen.getByTestId('profile-load-error')).toBeTruthy()
  })

  it('should link to the admin settings page even when the profile failed to load', () => {
    loaderData.current = { profile: null }
    render(<Page />)

    expect(screen.getByTestId('profile-admin-settings-link').getAttribute('href')).toBe('/admin-settings')
  })
})
