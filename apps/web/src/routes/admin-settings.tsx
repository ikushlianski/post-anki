import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'

import type { KnowledgeItemModelId, ModelTier } from '@post-anki/shared'
import {
  getAdminSettings,
  updateAdminSettings,
} from '../admin-settings/admin-settings.api'
import { AdminSettingsToggle } from '../admin-settings/admin-settings-toggle'
import { KnowledgeItemModelSelect } from '../admin-settings/knowledge-item-model-select'
import { ModelTierSelect } from '../admin-settings/model-tier-select'
import { getPendingPlacementSuggestions } from '../knowledge-bit/knowledge-bit.api'
import { PlacementSuggestionsPanel } from '../knowledge-bit/placement-suggestions-panel'
import { getBoard } from '../curriculum/curriculum.api'

export const Route = createFileRoute('/admin-settings')({
  component: AdminSettingsPage,
  loader: async () => {
    const [settings, placementSuggestions, board] = await Promise.all([
      getAdminSettings(),
      getPendingPlacementSuggestions(),
      getBoard(),
    ])

    return { settings, placementSuggestions, board }
  },
})

function AdminSettingsPage() {
  const { settings, placementSuggestions, board } = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function setTestToggle(testToggle: boolean) {
    setBusy(true)
    await updateAdminSettings({ data: { testToggle } })
    setBusy(false)
    await router.invalidate()
  }

  async function setModelTier(modelTier: ModelTier) {
    setBusy(true)
    await updateAdminSettings({ data: { modelTier } })
    setBusy(false)
    await router.invalidate()
  }

  async function setKnowledgeItemModel(knowledgeItemModelId: KnowledgeItemModelId) {
    setBusy(true)
    await updateAdminSettings({ data: { knowledgeItemModelId } })
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
        <ModelTierSelect
          label="Model tier"
          description="Global default model cost tier for every AI call that has no subject/curriculum override."
          value={settings.modelTier}
          onChange={setModelTier}
          disabled={busy}
          testId="admin-settings-model-tier"
        />
        <KnowledgeItemModelSelect
          label="Knowledge item model"
          description="Model for detecting knowledge items and writing their questions and cards. Applies from the next run; a run already in progress keeps its model."
          value={settings.knowledgeItemModelId}
          onChange={setKnowledgeItemModel}
          disabled={busy}
          testId="admin-settings-knowledge-item-model"
        />
        <AdminSettingsToggle
          label="Test toggle"
          description="A placeholder switch for wiring up admin settings end to end."
          value={settings.testToggle}
          onChange={setTestToggle}
          disabled={busy}
        />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Approve suggestions</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Approve, reject, or edit newly detected knowledge bits before they go live.
        </p>
        <Link
          to="/knowledge-bit-review"
          data-testid="admin-settings-knowledge-bit-review-link"
          className="mt-2 inline-block text-sm font-medium text-neutral-900 underline"
        >
          Review pending knowledge bits
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Placement suggestions</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Knowledge bits with no existing topic match — accept into a module or reject.
        </p>
        <div className="mt-3">
          <PlacementSuggestionsPanel
            initialSuggestions={placementSuggestions}
            subjects={board.subjects}
            curricula={board.curricula}
          />
        </div>
      </section>
    </main>
  )
}
