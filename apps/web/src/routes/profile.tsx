import { Link, createFileRoute } from '@tanstack/react-router'

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

      <Link
        to="/admin-settings"
        data-testid="profile-admin-settings-link"
        className="mt-8 flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:bg-neutral-50"
      >
        <span>
          <span className="block text-sm font-medium text-neutral-900">Admin settings</span>
          <span className="block text-sm text-neutral-500">Extraction model, new cards per day and more</span>
        </span>
        <span aria-hidden="true" className="text-neutral-400">
          →
        </span>
      </Link>
    </main>
  )
}
