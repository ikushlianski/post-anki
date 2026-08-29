import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'

import { MODEL_TIER_LABEL, type ModelTier } from '@post-anki/shared'
import type { Curriculum, Depth, Speed } from './model'
import { updateCurriculumSettings } from './curriculum.api'
import { curriculumDetailQuery } from './curriculum.queries'
import { DepthSlider } from './depth-slider'

const MODEL_TIERS: ModelTier[] = ['cheap', 'balanced', 'premium']

const SPEEDS: Speed[] = ['slow', 'normal', 'fast']

const SPEED_LABEL: Record<Speed, string> = {
  slow: 'Slow',
  normal: 'Normal',
  fast: 'Fast',
}

const DEPTH_LABEL: Record<Depth, string> = {
  aware: 'Aware',
  working: 'Working',
  deep: 'Deep',
}

export function adaptiveSettingsSummary(curriculum: Curriculum): string {
  return [
    SPEED_LABEL[curriculum.speed],
    curriculum.hinting ? 'hints on' : 'hints off',
    `depth ${DEPTH_LABEL[curriculum.defaultDepth]}`,
    `strict order ${curriculum.strictOrder ? 'on' : 'off'}`,
  ].join(' · ')
}

export function AdaptiveSettings({
  curriculum,
  inheritedModelTier,
}: {
  curriculum: Curriculum
  // The tier this curriculum would resolve to if it had no override of its
  // own — the subject's tier if set, else the global default. Shown next to
  // "Inherit" so picking it never feels like a black box.
  inheritedModelTier: ModelTier
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function update(patch: {
    speed?: Speed
    hinting?: boolean
    defaultDepth?: Depth
    strictOrder?: boolean
    modelTier?: ModelTier | null
  }) {
    setBusy(true)
    await updateCurriculumSettings({
      data: { curriculumId: curriculum.id, ...patch },
    })
    setBusy(false)
    await queryClient.invalidateQueries({
      queryKey: curriculumDetailQuery(curriculum.id).queryKey,
    })
    await router.invalidate()
  }

  return (
    <div className="space-y-3" data-testid="adaptive-settings">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        Adaptive settings
      </p>

      <div>
        <p className="mb-1 text-xs text-neutral-400">
          Pace — how fast the mentor ramps difficulty while probing
        </p>
        <div className="flex gap-1">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              disabled={busy}
              onClick={() => update({ speed })}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                curriculum.speed === speed
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              }`}
            >
              {SPEED_LABEL[speed]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-neutral-400">
          Hints — the mentor adds a one-line nudge with each question
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => update({ hinting: !curriculum.hinting })}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
            curriculum.hinting
              ? 'bg-emerald-600 text-white'
              : 'bg-neutral-200 text-neutral-600'
          }`}
        >
          {curriculum.hinting ? 'On' : 'Off'}
        </button>
      </div>

      <div>
        <p className="mb-1 text-xs text-neutral-400">
          Default depth — applied to new topics unless you set their own
        </p>
        <DepthSlider
          value={curriculum.defaultDepth}
          onChange={(defaultDepth) => update({ defaultDepth })}
          disabled={busy}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-neutral-400">
          Strict document order — display follows the source documentation's
          sequence; promotions and demotions are still recorded but won't
          reorder topics while this is on
        </p>
        <button
          type="button"
          data-testid="strict-order-toggle"
          disabled={busy}
          onClick={() => update({ strictOrder: !curriculum.strictOrder })}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
            curriculum.strictOrder
              ? 'bg-amber-600 text-white'
              : 'bg-neutral-200 text-neutral-600'
          }`}
        >
          {curriculum.strictOrder ? 'On' : 'Off'}
        </button>
      </div>

      <div>
        <p className="mb-1 text-xs text-neutral-400">
          Model tier — which OpenRouter cost tier this curriculum's AI calls use
        </p>
        <div className="flex flex-wrap gap-1" data-testid="curriculum-model-tier">
          <button
            type="button"
            disabled={busy}
            data-testid="curriculum-model-tier-inherit"
            onClick={() => update({ modelTier: null })}
            className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
              curriculum.modelTier === null
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
            }`}
          >
            Inherit (currently: {MODEL_TIER_LABEL[inheritedModelTier]})
          </button>
          {MODEL_TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              disabled={busy}
              data-testid={`curriculum-model-tier-option-${tier}`}
              onClick={() => update({ modelTier: tier })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                curriculum.modelTier === tier
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              }`}
            >
              {MODEL_TIER_LABEL[tier]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
