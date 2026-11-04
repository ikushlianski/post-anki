import { Link, createFileRoute, useRouter } from '@tanstack/react-router'

import { AccountSection } from '../account/account-section'
import { getAccount, updateAccount } from '../account/account.api'
import { getGamificationProfile } from '../gamification/gamification.api'
import { ProfileView } from '../gamification/profile-view'
import { ProgressPanel } from '../motivation/progress-panel'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/profile')({
  head: pageHead('Profile'),
  component: ProfilePage,
  loader: async () => {
    const [profile, account] = await Promise.all([getGamificationProfile(), getAccount()])

    return { profile, account }
  },
})

function ProfilePage() {
  const { profile, account } = Route.useLoaderData()
  const router = useRouter()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Your progress, badges and level. Badges are never taken away.
        </p>
      </header>

      {account ? (
        <AccountSection account={account} onSaveName={(name) => updateAccount({ data: { name } })} />
      ) : (
        <div role="alert" data-testid="account-load-error" className="mb-8 flex items-center gap-3 text-sm text-neutral-500">
          <p>Couldn't load your account details right now.</p>
          <button
            type="button"
            data-testid="account-load-retry"
            onClick={() => void router.invalidate()}
            className="rounded-md border border-neutral-300 px-3 py-1 text-neutral-700 hover:bg-neutral-50"
          >
            Try again
          </button>
        </div>
      )}

      <div className="mb-8">
        <ProgressPanel />
      </div>

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
