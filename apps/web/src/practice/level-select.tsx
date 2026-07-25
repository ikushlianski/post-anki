import type { PracticeLevel } from '@post-anki/shared'

import { updatePracticeSettings } from './practice.api'
import { usePracticeSettings } from './use-practice-settings'
import { LEVEL_LABELS, LEVEL_VALUES } from './practice.constants'

const LEVEL_TESTIDS: Record<PracticeLevel, string> = {
  A1_A2: 'level-select-a1-a2',
  B1_B2: 'level-select-b1-b2',
  C1_C2: 'level-select-c1-c2',
}

export function LevelSelect({ subjectId }: { subjectId: string }) {
  const settings = usePracticeSettings(subjectId)
  const currentLevel = settings?.level

  return (
    <div className="flex gap-2">
      {LEVEL_VALUES.map((level) => (
        <button
          key={level}
          type="button"
          data-testid={LEVEL_TESTIDS[level]}
          aria-pressed={currentLevel === level}
          onClick={() => updatePracticeSettings({ data: { subjectId, level } })}
          className={
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors ' +
            (currentLevel === level
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700')
          }
        >
          {LEVEL_LABELS[level]}
        </button>
      ))}
    </div>
  )
}
