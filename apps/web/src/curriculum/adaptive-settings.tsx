import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'

import type { Curriculum, Depth, Speed } from './model'
import { updateCurriculumSettings } from './curriculum.api'
import { DepthSlider } from './depth-slider'

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

export function AdaptiveSettings({ curriculum }: { curriculum: Curriculum }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  async function update(patch: {
    speed?: Speed
    hinting?: boolean
    defaultDepth?: Depth
  }) {
    setBusy(true)
    await updateCurriculumSettings({
      data: { curriculumId: curriculum.id, ...patch },
    })
    setBusy(false)
    await router.invalidate()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-neutral-500 hover:text-neutral-900"
      >
        ⚙ Adaptive settings · {SPEED_LABEL[curriculum.speed]} ·{' '}
        {curriculum.hinting ? 'hints on' : 'hints off'} · default depth{' '}
        {DEPTH_LABEL[curriculum.defaultDepth]}
      </button>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Adaptive settings</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-400 hover:text-neutral-700"
        >
          Close
        </button>
      </div>

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
    </div>
  )
}
