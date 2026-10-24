import { createFileRoute } from '@tanstack/react-router'

import { getGamificationProfile } from '../gamification/gamification.api'
import { ProfileView } from '../gamification/profile-view'

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
  loader: async () => ({ profile: await getGamificationProfile() }),
})

function ProfilePage() {
  const { profile } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Your level and badges. Badges are never taken away.
        </p>
      </header>

      {profile ? (
        <ProfileView profile={profile} />
      ) : (
        <p data-testid="profile-load-error" className="text-sm text-neutral-500">
          Couldn't load your profile right now.
        </p>
      )}
    </main>
  )
}
