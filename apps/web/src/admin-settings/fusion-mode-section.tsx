import { useState } from 'react'

import {
  FUSION_MAX_MODELS,
  FUSION_MIN_MODELS,
  KNOWLEDGE_ITEM_MODEL_IDS,
  KNOWLEDGE_ITEM_MODELS,
  type AdminSettingsResponse,
  type KnowledgeItemModelId,
} from '@post-anki/shared'

import type { FusionSaveResult } from './admin-settings.api'
import { AdminSettingsToggle } from './admin-settings-toggle'

type FusionState = Pick<AdminSettingsResponse, 'fusionEnabled' | 'fusionModelIds' | 'fusionEstimate'>

function usd(value: number) {
  return `$${value.toFixed(4)}`
}

export function FusionModeSection({
  initial,
  onSave,
}: {
  initial: FusionState
  onSave: (data: {
    fusionEnabled: boolean
    fusionModelIds: KnowledgeItemModelId[]
  }) => Promise<FusionSaveResult>
}) {
  const [enabled, setEnabled] = useState(initial.fusionEnabled)
  const [ids, setIds] = useState<KnowledgeItemModelId[]>(initial.fusionModelIds)
  const [estimate, setEstimate] = useState(initial.fusionEstimate)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const atCap = ids.length >= FUSION_MAX_MODELS
  const tooFew = enabled && ids.length < FUSION_MIN_MODELS

  function toggleId(id: KnowledgeItemModelId, checked: boolean) {
    setSaved(false)
    setIds((current) => (checked ? [...current, id] : current.filter((item) => item !== id)))
  }

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)

    try {
      const result = await onSave({ fusionEnabled: enabled, fusionModelIds: ids })

      if (result.ok) {
        setEnabled(result.settings.fusionEnabled)
        setIds(result.settings.fusionModelIds)
        setEstimate(result.settings.fusionEstimate)
        setSaved(true)
      } else {
        setError(result.message)
      }
    } catch {
      setError('Could not save, try again.')
    }

    setBusy(false)
  }

  return (
    <section data-testid="fusion-mode-section" className="mt-3 space-y-3">
      <AdminSettingsToggle
        label="Fusion mode"
        description={`Runs several models on each source and merges their results. Needs ${FUSION_MIN_MODELS} to ${FUSION_MAX_MODELS} models. Costs more per source.`}
        value={enabled}
        onChange={(next) => {
          setSaved(false)
          setEnabled(next)
        }}
        disabled={busy}
      />
      <fieldset className="rounded-lg bg-neutral-50 p-4">
        <legend className="px-1 text-sm font-medium">Fusion models</legend>
        <div className="mt-2 space-y-1">
          {KNOWLEDGE_ITEM_MODEL_IDS.map((id) => {
            const checked = ids.includes(id)

            return (
              <label
                key={id}
                className="flex min-h-[44px] items-center gap-2 text-sm sm:min-h-0"
              >
                <input
                  type="checkbox"
                  data-testid={`fusion-model-${id}`}
                  checked={checked}
                  disabled={busy || (!checked && atCap)}
                  onChange={(event) => toggleId(id, event.target.checked)}
                />
                {KNOWLEDGE_ITEM_MODELS[id].label}
              </label>
            )
          })}
        </div>
        {tooFew ? (
          <p role="status" data-testid="fusion-too-few" className="mt-2 text-sm text-amber-700">
            Pick at least {FUSION_MIN_MODELS} models to use fusion mode.
          </p>
        ) : null}
      </fieldset>
      <div data-testid="fusion-estimate" className="rounded-lg bg-neutral-50 p-4 text-sm">
        <p className="font-medium">
          Estimated cost per source: <span data-testid="fusion-estimate-total">{usd(estimate.totalEstimatedCostUsd)}</span>
        </p>
        <ul className="mt-1 text-xs text-neutral-500">
          {estimate.perModel.map((entry) => (
            <li key={entry.modelId}>
              {KNOWLEDGE_ITEM_MODELS[entry.modelId].label}: {usd(entry.estimatedCostUsd)}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        data-testid="fusion-save"
        disabled={busy}
        onClick={save}
        className="min-h-[44px] rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50 sm:min-h-0 sm:py-2"
      >
        Save fusion settings
      </button>
      {error ? (
        <p role="alert" data-testid="fusion-save-error" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" data-testid="fusion-saved" className="text-sm text-emerald-700">
          Saved.
        </p>
      ) : null}
    </section>
  )
}
