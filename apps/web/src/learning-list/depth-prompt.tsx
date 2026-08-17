import { useState } from 'react'

import type { DepthLevel } from '@post-anki/shared'

import {
  DEPTH_CHOICE_LABEL,
  type DepthChoice,
  depthChoiceIntent,
  depthForChoice,
} from './depth-choice'

const CHOICES: DepthChoice[] = ['basics', 'advanced']

export interface DepthPromptProps {
  topicTitle: string
  electedDepth: DepthLevel | null
  onElect: (depth: DepthLevel) => Promise<void>
}

export function DepthPrompt({
  topicTitle,
  electedDepth,
  onElect,
}: DepthPromptProps) {
  const [busy, setBusy] = useState(false)

  if (electedDepth !== null) {
    return null
  }

  async function elect(choice: DepthChoice) {
    setBusy(true)
    await onElect(depthForChoice(choice))
    setBusy(false)
  }

  return (
    <div
      data-testid="depth-prompt"
      className="mb-4 rounded-lg border border-neutral-900 bg-white p-4"
    >
      <p className="text-sm font-medium">
        How far do you want to take “{topicTitle}”?
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">
        Asked once, the first time this topic comes up. Questions are generated
        only to the level you pick; the rest is kept as headroom.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={busy}
            onClick={() => void elect(choice)}
            data-testid={`depth-choice-${choice}`}
            data-depth={depthForChoice(choice)}
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-left hover:border-neutral-900 disabled:opacity-50"
          >
            <span className="block text-xs font-medium">
              {DEPTH_CHOICE_LABEL[choice]}
            </span>
            <span className="mt-0.5 block text-[11px] text-neutral-500">
              {depthChoiceIntent(choice)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
