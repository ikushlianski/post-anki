import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import type { CrossCuttingNudge } from '@post-anki/shared'

import type { DailyPushReason, QuestionKind } from '../curriculum/model'
import {
  getDailyPush,
  getGapMasteryCrossCuttingNudges,
} from '../curriculum/curriculum.api'
import { ProbeAnswer } from '../curriculum/probe-answer'
import { NudgePanel } from '../learning-list/nudge-panel'
import { respondToNudge } from '../learning-list/learning-list.api'

export const Route = createFileRoute('/today')({
  validateSearch: (search: Record<string, unknown>): { mode: QuestionKind } => ({
    mode: search.mode === 'quick_test' ? 'quick_test' : 'socratic',
  }),
  loaderDeps: ({ search }) => ({ mode: search.mode }),
  loader: async ({ deps }) => {
    const [push, nudges] = await Promise.all([
      getDailyPush({ data: deps.mode }),
      getGapMasteryCrossCuttingNudges(),
    ])

    return { ...push, nudges }
  },
  component: TodayPage,
})

// Generalized recall-gap mastery tracking (issue #57, SCENARIO 7) — a
// passive, appear-once banner naming a concept recurring across 3+
// mastery-tracked subjects. No dismiss-tracking queue, no badge count
// anywhere else — matches "silent on non-response"/no-nagging.
function CrossCuttingNudgeBanner({ nudges }: { nudges: CrossCuttingNudge[] }) {
  if (nudges.length === 0) {
    return null
  }

  return (
    <div className="mb-6 space-y-2">
      {nudges.map((nudge) => (
        <div
          key={nudge.label}
          data-testid="cross-cutting-nudge-banner"
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900"
        >
          <span className="font-medium">"{nudge.label}"</span> keeps coming up
          — {nudge.subjectNames.join(', ')}.
        </div>
      ))}
    </div>
  )
}

const REASON_LABEL: Record<DailyPushReason, string> = {
  wanted: 'You asked for this one',
  weakest: 'Your weakest open area',
  refresh: 'Worth refreshing',
}

function TodayPage() {
  const { push, question, nudge, nudges } = Route.useLoaderData()
  const { mode } = Route.useSearch()
  const router = useRouter()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      {nudge ? (
        <NudgePanel
          key={`${nudge.entityType}:${nudge.entityId}`}
          nudge={nudge}
          onRespond={(data) => respondToNudge({ data })}
          onResponded={() => router.invalidate()}
        />
      ) : null}
      <CrossCuttingNudgeBanner nudges={nudges} />
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-neutral-500">
            One gap to answer right now, chosen across everything you’ve
            confirmed — what you asked for first, then your weakest spots.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void router.invalidate()}
          className="shrink-0 text-xs text-neutral-500 hover:text-neutral-900"
        >
          ↻ New push
        </button>
      </header>

      {!push ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          Nothing to push yet. Confirm a curriculum and mark a few gaps as
          wanted, and one will surface here.
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-900 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-block rounded-full bg-neutral-900 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">
              {REASON_LABEL[push.reason]}
            </span>
            <ModeToggle mode={mode} />
          </div>

          <p className="mt-3 text-xs text-neutral-400">
            {push.curriculumName} · {push.topicTitle}
          </p>
          <h2 className="mt-1 text-lg font-medium text-neutral-900">
            {push.gap.label}
          </h2>

          <div className="mt-4">
            {question ? (
              <ProbeAnswer
                key={`${mode}:${question.id}`}
                topicId={push.topicId}
                mode={mode}
                question={question}
                autoInvalidate={false}
              />
            ) : (
              <p className="text-sm text-neutral-500">
                Couldn’t load a question right now — try ↻ New push.
              </p>
            )}
          </div>

          <Link
            to="/curriculum/$curriculumId"
            params={{ curriculumId: push.curriculumId }}
            className="mt-4 inline-block text-xs text-neutral-500 hover:text-neutral-900"
          >
            Open the curriculum →
          </Link>
        </div>
      )}
    </main>
  )
}

function ModeToggle({ mode }: { mode: QuestionKind }) {
  const base = 'rounded-md px-2.5 py-1 text-xs font-medium'
  const on = 'bg-neutral-900 text-white'
  const off = 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'

  return (
    <div className="flex gap-1">
      <Link
        to="/today"
        search={{ mode: 'socratic' }}
        className={`${base} ${mode === 'socratic' ? on : off}`}
      >
        Socratic
      </Link>
      <Link
        to="/today"
        search={{ mode: 'quick_test' }}
        className={`${base} ${mode === 'quick_test' ? on : off}`}
      >
        Quick test
      </Link>
    </div>
  )
}
