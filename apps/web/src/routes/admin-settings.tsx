import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'

import type { KnowledgeItemModelId, ModelTier, UpdateAdminSettingsInput } from '@post-anki/shared'
import {
  getAdminSettings,
  saveFusionSettings,
  updateAdminSettings,
} from '../admin-settings/admin-settings.api'
import { AdminSettingsToggle } from '../admin-settings/admin-settings-toggle'
import { ChatUsagePanel } from '../chat-usage/chat-usage-panel'
import { clearAllKnowledge } from '../admin-settings/clear-all-knowledge.api'
import { ClearAllKnowledgeZone } from '../admin-settings/clear-all-knowledge-zone'
import { FusionModeSection } from '../admin-settings/fusion-mode-section'
import { KnowledgeItemModelSelect } from '../admin-settings/knowledge-item-model-select'
import { ModelTierSelect } from '../admin-settings/model-tier-select'
import { NotionConnectionPanel } from '../admin-settings/notion-connection-panel'
import { NewCardsPerDayField } from '../admin-settings/new-cards-per-day-field'
import { ReviewsPerDayField } from '../admin-settings/reviews-per-day-field'
import { RetentionField } from '../subject-study-options/retention-field'
import { StepsField } from '../subject-study-options/steps-field'
import { DailyGoalField } from '../study-goal/daily-goal-field'
import { MotivationSettingsField } from '../motivation/motivation-settings-form'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/admin-settings')({
  head: pageHead('Admin settings'),
  component: AdminSettingsPage,
  loader: async () => ({ settings: await getAdminSettings() }),
})

type SettingField =
  | 'testToggle'
  | 'modelTier'
  | 'knowledgeItemModel'
  | 'newCardsPerDay'
  | 'maxReviewsPerDay'
  | 'mixNewWithDue'
  | 'learningSteps'
  | 'relearningSteps'
  | 'desiredRetention'

function AdminSettingsPage() {
  const { settings } = Route.useLoaderData()
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
  const setMaxReviewsPerDay = (maxReviewsPerDay: number) => save('maxReviewsPerDay', { maxReviewsPerDay })
  const setMixNewWithDue = (mixNewWithDue: boolean) => save('mixNewWithDue', { mixNewWithDue })
  const setLearningSteps = (learningStepsMinutes: number[]) =>
    save('learningSteps', { learningStepsMinutes })
  const setRelearningSteps = (relearningStepsMinutes: number[]) =>
    save('relearningSteps', { relearningStepsMinutes })
  const setDesiredRetention = (desiredRetention: number) =>
    save('desiredRetention', { desiredRetention })

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
        <FusionModeSection
          initial={settings}
          onSave={async (data) => {
            const result = await saveFusionSettings({ data })

            if (result.ok) {
              await router.invalidate().catch(() => setRefreshFailed(true))
            }

            return result
          }}
        />
        <NewCardsPerDayField
          label="New cards per day"
          description="App default for the most new cards shown per subject in a day, from 1 to 200. Subjects can override it. Reviews that are due are not limited."
          value={settings.newCardsPerDay}
          onChange={setNewCardsPerDay}
          disabled={busy}
          testId="admin-settings-new-cards-per-day"
        />
        {saveError('newCardsPerDay')}
        <ReviewsPerDayField
          label="Reviews per day"
          description="The most reviews in a day before the session ends with a done-for-today message, from 0 to 9999. 0 means no limit. You can still review ahead. A subject can set its own number, but a value above this one is still stopped by this limit."
          value={settings.maxReviewsPerDay}
          onChange={setMaxReviewsPerDay}
          disabled={busy}
          testId="admin-settings-max-reviews-per-day"
        />
        {saveError('maxReviewsPerDay')}
        <AdminSettingsToggle
          label="Mix new cards with cards I've already seen"
          description="On: new cards are shown in between the cards you have already seen. Off: new cards come in a separate block."
          value={settings.mixNewWithDue}
          onChange={setMixNewWithDue}
          disabled={busy}
        />
        {saveError('mixNewWithDue')}
        <StepsField
          label="Learning steps (minutes)"
          description="App default for how soon a new card repeats, for example 1, 10. Subjects can override it."
          value={settings.learningStepsMinutes}
          onChange={setLearningSteps}
          disabled={busy}
          testId="admin-settings-learning-steps"
        />
        {saveError('learningSteps')}
        <StepsField
          label="Relearning steps (minutes)"
          description="App default for how soon a forgotten card comes back, for example 10. Subjects can override it."
          value={settings.relearningStepsMinutes}
          onChange={setRelearningSteps}
          disabled={busy}
          testId="admin-settings-relearning-steps"
        />
        {saveError('relearningSteps')}
        <RetentionField
          label="Desired retention (%)"
          description="App default for how sure you want to be of remembering a card. Higher means shorter gaps and more reviews. 90% suits most; 80-95% is the useful range. Subjects can override it."
          value={settings.desiredRetention}
          onChange={setDesiredRetention}
          disabled={busy}
          testId="admin-settings-desired-retention"
        />
        {saveError('desiredRetention')}
        <AdminSettingsToggle
          label="Test toggle"
          description="Has no effect on your cards. It only confirms that settings save."
          value={settings.testToggle}
          onChange={setTestToggle}
          disabled={busy}
        />
        {saveError('testToggle')}
      </div>

      <DailyGoalField />
      <MotivationSettingsField />

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Approve suggestions</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Approve, reject, or edit newly detected cards before they go live.
        </p>
        <Link
          to="/knowledge-bit-review"
          data-testid="admin-settings-knowledge-bit-review-link"
          className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-neutral-900 underline sm:min-h-0"
        >
          Review pending cards
        </Link>
      </section>

      <NotionConnectionPanel />

      <ChatUsagePanel />

      <ClearAllKnowledgeZone
        onClear={() => clearAllKnowledge()}
        onCleared={() => router.invalidate()}
      />
    </main>
  )
}
