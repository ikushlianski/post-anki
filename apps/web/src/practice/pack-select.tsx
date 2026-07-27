import type { Pack, PracticeSettings } from '@post-anki/shared'

import { updatePracticeSettings } from './practice.api'
import { usePracticeSettings } from './use-practice-settings'
import { PACK_LABELS, PACK_VALUES } from './practice.constants'

const PACK_TESTIDS: Record<Pack, string> = {
  General: 'pack-select-general',
  StandupUpdates: 'pack-select-standup-updates',
  CodeReview: 'pack-select-code-review',
  IncidentPostmortems: 'pack-select-incident-postmortems',
  GivingFeedback: 'pack-select-giving-feedback',
}

export function PackSelect({
  subjectId,
  initialSettings,
}: {
  subjectId: string
  initialSettings?: PracticeSettings
}) {
  const settings = usePracticeSettings(subjectId, initialSettings)
  const currentPack = settings?.pack

  return (
    <div className="flex gap-2">
      {PACK_VALUES.map((pack) => (
        <button
          key={pack}
          type="button"
          data-testid={PACK_TESTIDS[pack]}
          aria-pressed={currentPack === pack}
          onClick={() => updatePracticeSettings({ data: { subjectId, pack } })}
          className={
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors ' +
            (currentPack === pack
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700')
          }
        >
          {PACK_LABELS[pack]}
        </button>
      ))}
    </div>
  )
}
