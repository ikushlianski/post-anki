import { useState } from 'react'

import type {
  StudyForecast,
  SubjectStudyOptions,
  UpdateSubjectStudyOptionsInput,
} from '@post-anki/shared'
import { ComplexityField } from './complexity-field'
import { NewCardsPerDayField } from '../admin-settings/new-cards-per-day-field'
import { isExamDateMessage } from '../study-plan/exam-date-messages'
import { ExamDateField } from './exam-date-field'
import { ReviewsPerDayField } from '../admin-settings/reviews-per-day-field'
import { LearningSettingsField } from './learning-settings-field'
import { InheritedHint } from './inherited-hint'
import { RetentionField } from './retention-field'
import { StepsField } from './steps-field'
import { intentSourceText, StudyIntentField, type IntentChoice } from './study-intent-field'

const choiceOf = (options: SubjectStudyOptions): IntentChoice => options.own.studyIntent ?? 'inherit'

export function SubjectStudyOptionsForm({
  subjectId,
  initial,
  subjectNames,
  forecast = null,
  onSave,
}: {
  subjectId: string
  initial: SubjectStudyOptions
  subjectNames: Record<string, string>
  forecast?: StudyForecast | null
  onSave: (patch: UpdateSubjectStudyOptionsInput) => Promise<SubjectStudyOptions>
}) {
  const [options, setOptions] = useState(initial)
  const [choice, setChoice] = useState<IntentChoice>(choiceOf(initial))
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  async function save(patch: UpdateSubjectStudyOptionsInput): Promise<boolean> {
    setBusy(true)
    setFailure(null)

    try {
      const saved = await onSave(patch)

      setOptions(saved)
      setChoice(choiceOf(saved))

      return true
    } catch (error) {
      setFailure(error instanceof Error && isExamDateMessage(error.message) ? error.message : '')

      if (patch.studyIntent !== 'exam') {
        setChoice(choiceOf(options))
      }

      return false
    } finally {
      setBusy(false)
    }
  }

  function chooseIntent(next: IntentChoice) {
    setChoice(next)

    if (next !== 'exam') {
      void save({ studyIntent: next === 'inherit' ? null : next })
    }
  }

  const hint = (key: keyof SubjectStudyOptions['sources']) => (
    <InheritedHint
      testId={`study-options-${key}-source`}
      source={options.sources[key]}
      subjectId={subjectId}
      subjectNames={subjectNames}
      disabled={busy}
      onReset={() => void save({ [key]: null })}
    />
  )
  const { effective } = options
  const stamp = JSON.stringify(effective)
  const paced = forecast?.newCards.paced === true
  const examOwn = choice === 'exam'

  return (
    <section data-testid="subject-study-options" className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">Study options</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Applies to this subject and its sub-subjects unless they set their own.
      </p>
      {failure !== null && !(examOwn && failure !== '') ? (
        <p role="alert" data-testid="study-options-save-error" className="mt-2 text-sm text-red-600">
          {failure || 'Could not save, try again.'}
        </p>
      ) : null}
      <div key={stamp} className="mt-3 space-y-3">
        <StudyIntentField
          value={choice}
          onChange={chooseIntent}
          disabled={busy}
          testId="study-options-intent"
          hint={
            <p data-testid="study-options-intent-source" className="mt-1 text-xs text-neutral-500">
              {intentSourceText(options.intent, subjectId, subjectNames)}
            </p>
          }
        />
        {examOwn ? (
          <ExamDateField
            value={options.own.examDate}
            error={failure}
            disabled={busy}
            testId="study-options-exam-date"
            onCommit={(examDate) => save({ studyIntent: 'exam', examDate })}
          />
        ) : null}
        <ComplexityField
          options={options}
          subjectId={subjectId}
          subjectNames={subjectNames}
          disabled={busy}
          onChange={(complexityLevel) => void save({ complexityLevel, desiredRetention: null })}
        />
        <RetentionField
          label="Desired retention (%)"
          description="Higher means shorter gaps and more reviews. 90% suits most; 80-95% is the useful range."
          value={effective.desiredRetention}
          onChange={(desiredRetention) => save({ desiredRetention, complexityLevel: null })}
          disabled={busy}
          testId="study-options-retention"
          hint={hint('desiredRetention')}
        />
        <NewCardsPerDayField
          label={paced ? 'New cards per day (Auto)' : 'New cards per day'}
          description={
            paced
              ? `Auto: ${forecast?.newCards.perDay ?? 0} a day today, spread so new material is done three quarters of the way to the exam. Type a number to set your own.`
              : 'Most new cards from this subject shown in a day.'
          }
          value={paced ? (forecast?.newCards.perDay ?? effective.newCardsPerDay) : effective.newCardsPerDay}
          onChange={(newCardsPerDay) => save({ newCardsPerDay })}
          disabled={busy}
          testId="study-options-new-cards"
          hint={hint('newCardsPerDay')}
        />
        <ReviewsPerDayField
          label="Reviews per day"
          description="Most due reviews from this subject shown in a day. 0 means no subject limit. The app-wide daily limit still applies."
          value={effective.maxReviewsPerDay}
          onChange={(maxReviewsPerDay) => save({ maxReviewsPerDay })}
          disabled={busy}
          testId="study-options-max-reviews"
          hint={hint('maxReviewsPerDay')}
        />
        <LearningSettingsField
          detailLevel={options.own.detailLevel}
          hintingEnabled={options.own.hintingEnabled}
          disabled={busy}
          onDetailLevelChange={(detailLevel) => void save({ detailLevel })}
          onHintingChange={(hintingEnabled) => void save({ hintingEnabled })}
        />
        <details
          data-testid="study-options-more"
          open={moreOpen}
          onToggle={(event) => setMoreOpen(event.currentTarget.open)}
          className="rounded-lg border border-neutral-200 bg-white p-4"
        >
          <summary className="min-h-[44px] cursor-pointer text-sm font-medium sm:min-h-0">More options</summary>
          <div className="mt-3 space-y-3">
            <StepsField
              label="Learning steps (minutes)"
              description="Gaps between a new card's first repeats, for example 1, 10."
              value={effective.learningStepsMinutes}
              onChange={(learningStepsMinutes) => save({ learningStepsMinutes })}
              disabled={busy}
              testId="study-options-learning-steps"
              hint={hint('learningStepsMinutes')}
            />
            <StepsField
              label="Relearning steps (minutes)"
              description="Gaps before a forgotten card comes back, for example 10."
              value={effective.relearningStepsMinutes}
              onChange={(relearningStepsMinutes) => save({ relearningStepsMinutes })}
              disabled={busy}
              testId="study-options-relearning-steps"
              hint={hint('relearningStepsMinutes')}
            />
          </div>
        </details>
      </div>
    </section>
  )
}
