import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'

import { MODEL_TIER_LABEL, type ModelTier } from '@post-anki/shared'
import { updateSubjectModelTier } from './subject.api'

const TIERS: ModelTier[] = ['cheap', 'balanced', 'premium']

export function SubjectModelTier({
  subjectId,
  modelTier,
  globalModelTier,
}: {
  subjectId: string
  modelTier: ModelTier | null
  globalModelTier: ModelTier
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function set(next: ModelTier | null) {
    setBusy(true)
    await updateSubjectModelTier({ data: { subjectId, modelTier: next } })
    setBusy(false)
    await router.invalidate()
  }

  const effective = modelTier ?? globalModelTier

  return (
    <div data-testid={`subject-model-tier-${subjectId}`} className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-neutral-400">
        Model tier · {MODEL_TIER_LABEL[effective]}
        {modelTier === null ? ` (inherited from global: ${MODEL_TIER_LABEL[globalModelTier]})` : ''}
      </span>
      <button
        type="button"
        disabled={busy}
        data-testid={`subject-model-tier-inherit-${subjectId}`}
        onClick={() => set(null)}
        className={
          modelTier === null
            ? 'rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50'
            : 'rounded-full px-2 py-0.5 text-[11px] text-neutral-400 hover:text-neutral-700 disabled:opacity-50'
        }
      >
        Inherit
      </button>
      {TIERS.map((tier) => (
        <button
          key={tier}
          type="button"
          disabled={busy}
          data-testid={`subject-model-tier-option-${subjectId}-${tier}`}
          onClick={() => set(tier)}
          className={
            modelTier === tier
              ? 'rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50'
              : 'rounded-full px-2 py-0.5 text-[11px] text-neutral-400 hover:text-neutral-700 disabled:opacity-50'
          }
        >
          {MODEL_TIER_LABEL[tier]}
        </button>
      ))}
    </div>
  )
}
