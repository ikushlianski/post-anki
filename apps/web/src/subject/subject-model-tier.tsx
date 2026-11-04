import { MODEL_TIER_LABEL, type ModelTier } from '@post-anki/shared'
import { ActionFailedLine } from '../curriculum/action-failed-line'
import { useGuardedRun } from '../curriculum/use-guarded-run'
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
  const { busy, failed, run } = useGuardedRun()

  function set(next: ModelTier | null) {
    return run(() => updateSubjectModelTier({ data: { subjectId, modelTier: next } }))
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
            ? 'min-h-[44px] min-w-[44px] rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50 sm:min-h-0 sm:min-w-0'
            : 'min-h-[44px] min-w-[44px] rounded-full px-2 py-0.5 text-[11px] text-neutral-400 hover:text-neutral-700 disabled:opacity-50 sm:min-h-0 sm:min-w-0'
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
              ? 'min-h-[44px] min-w-[44px] rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50 sm:min-h-0 sm:min-w-0'
              : 'min-h-[44px] min-w-[44px] rounded-full px-2 py-0.5 text-[11px] text-neutral-400 hover:text-neutral-700 disabled:opacity-50 sm:min-h-0 sm:min-w-0'
          }
        >
          {MODEL_TIER_LABEL[tier]}
        </button>
      ))}
      <ActionFailedLine failed={failed} testId={`subject-model-tier-failed-${subjectId}`} />
    </div>
  )
}
