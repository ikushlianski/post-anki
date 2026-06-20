import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'

import {
  getAdminSettings,
  updateAdminSettings,
} from '../admin-settings/admin-settings.api'
import { AdminSettingsToggle } from '../admin-settings/admin-settings-toggle'

export const Route = createFileRoute('/admin-settings')({
  component: AdminSettingsPage,
  loader: () => getAdminSettings(),
})

function AdminSettingsPage() {
  const settings = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function setTestToggle(testToggle: boolean) {
    setBusy(true)
    await updateAdminSettings({ data: { testToggle } })
    setBusy(false)
    await router.invalidate()
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Application-wide switches. Changes apply immediately.
        </p>
      </header>

      <div className="space-y-3">
        <AdminSettingsToggle
          label="Test toggle"
          description="A placeholder switch for wiring up admin settings end to end."
          value={settings.testToggle}
          onChange={setTestToggle}
          disabled={busy}
        />
      </div>
    </main>
  )
}
