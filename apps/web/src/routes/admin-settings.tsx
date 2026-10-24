import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'

import type { KnowledgeItemModelId, ModelTier, UpdateAdminSettingsInput } from '@post-anki/shared'
import { getAdminSettings, updateAdminSettings } from '../admin-settings/admin-settings.api'
import { AdminSettingsToggle } from '../admin-settings/admin-settings-toggle'
import { clearAllKnowledge } from '../admin-settings/clear-all-knowledge.api'
import { ClearAllKnowledgeZone } from '../admin-settings/clear-all-knowledge-zone'
import { KnowledgeItemModelSelect } from '../admin-settings/knowledge-item-model-select'
import { ModelTierSelect } from '../admin-settings/model-tier-select'
import { NewCardsPerDayField } from '../admin-settings/new-cards-per-day-field'
import { getPendingPlacementSuggestions } from '../knowledge-bit/knowledge-bit.api'
import { PlacementSuggestionsPanel } from '../knowledge-bit/placement-suggestions-panel'
import { settle } from '../shared/load-result'
import { getBoard } from '../curriculum/curriculum.api'

export const Route = createFileRoute('/admin-settings')({
  component: AdminSettingsPage,
  loader: async () => {
    const [settings, placementSuggestions, board] = await Promise.all([
      getAdminSettings(),
      settle(getPendingPlacementSuggestions()),
      settle(getBoard()),
    ])

    return { settings, placementSuggestions, board }
  },
})

type SettingField = 'testToggle' | 'modelTier' | 'knowledgeItemModel' | 'newCardsPerDay'

function AdminSettingsPage() {
  const { settings, placementSuggestions, board } = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failedField, setFailedField] = useState<SettingField | null>(null)
  const [refreshFailed, setRefreshFailed] = useState(false)

  async function save(field: SettingField, data: UpdateAdminSettingsInput) {
    setBusy(true)
    setFailedField(null)
    setRefreshFailed(false)

    try {
      await updateAdminSettings({ data })
    } catch {
      setFailedField(field)
      setBusy(false)

      return false
    }

    await router.invalidate().catch(() => setRefreshFailed(true))
    setBusy(false)

    return true
  }

  const setTestToggle = (testToggle: boolean) => save('testToggle', { testToggle })
  const setModelTier = (modelTier: ModelTier) => save('modelTier', { modelTier })
  const setKnowledgeItemModel = (knowledgeItemModelId: KnowledgeItemModelId) =>
    save('knowledgeItemModel', { knowledgeItemModelId })
  const setNewCardsPerDay = (newCardsPerDay: number) => save('newCardsPerDay', { newCardsPerDay })

  const saveError = (field: SettingField) =>
    failedField === field ? (
      <p
        role="alert"
        data-testid={`admin-settings-save-error-${field}`}
        className="text-sm text-red-600"
      >
        Could not save, try again.
      </p>
    ) : null

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Application-wide switches. Changes apply immediately.
        </p>
      </header>

      {refreshFailed ? (
        <p
          role="status"
          data-testid="admin-settings-refresh-error"
          className="mb-3 text-sm text-amber-700"
        >
          Saved, but the page could not refresh. Reload to see the current values.
        </p>
      ) : null}

      <div className="space-y-3">
        <ModelTierSelect
          label="Model tier"
          description="Global default model cost tier for every AI call that has no subject/curriculum override."
          value={settings.modelTier}
          onChange={setModelTier}
          disabled={busy}
          testId="admin-settings-model-tier"
        />
        {saveError('modelTier')}
        <KnowledgeItemModelSelect
          label="Knowledge item model"
          description="Model for detecting knowledge items and writing their questions and cards. Applies from the next run; a run already in progress keeps its model."
          value={settings.knowledgeItemModelId}
          onChange={setKnowledgeItemModel}
          disabled={busy}
          testId="admin-settings-knowledge-item-model"
        />
        {saveError('knowledgeItemModel')}
        <NewCardsPerDayField
          label="New cards per day"
          description="Most new cards shown in a day, from 1 to 200. Reviews that are due are not limited."
          value={settings.newCardsPerDay}
          onChange={setNewCardsPerDay}
          disabled={busy}
          testId="admin-settings-new-cards-per-day"
        />
        {saveError('newCardsPerDay')}
        <AdminSettingsToggle
          label="Test toggle"
          description="A placeholder switch for wiring up admin settings end to end."
          value={settings.testToggle}
          onChange={setTestToggle}
          disabled={busy}
        />
        {saveError('testToggle')}
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
          {placementSuggestions.ok && board.ok ? (
            <PlacementSuggestionsPanel
              initialSuggestions={placementSuggestions.data}
              subjects={board.data.subjects}
              curricula={board.data.curricula}
            />
          ) : (
            <p data-testid="admin-settings-placement-load-error" className="text-sm text-red-600">
              Could not load placement suggestions. Reload to try again.
            </p>
          )}
        </div>
      </section>

      <ClearAllKnowledgeZone
        onClear={() => clearAllKnowledge()}
        onCleared={() => router.invalidate()}
      />
    </main>
  )
}
