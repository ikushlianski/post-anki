import { useState } from 'react'
import type { CourseRefocusSuggestion } from './model'
import { dismissCourseRefocusSuggestion } from './curriculum.api'

// cross-course-refocus-suggestion (issue #70) — plain-language copy per
// reason, matching the banner's own job (informing, not navigating —
// spec.md's Decisions: no deep-link, no one-click "apply"). Keyed by
// reason, not curriculumId, since the same course could independently
// surface either reason at different times.
const REASON_COPY: Record<
  CourseRefocusSuggestion['reason'],
  (suggestion: CourseRefocusSuggestion) => string
> = {
  stale_top_priority: (suggestion) =>
    `hasn't been touched in ${suggestion.daysSinceActivity} day${
      suggestion.daysSinceActivity === 1 ? '' : 's'
    }, even though it's a top priority in ${suggestion.subjectName}`,
  new_high_priority_ignored: () => `is new and top priority, but hasn't been opened yet`,
}

function suggestionKey(suggestion: CourseRefocusSuggestion): string {
  return `${suggestion.curriculumId}:${suggestion.reason}`
}

// SCENARIO 9 — non-blocking: renders above/alongside existing home page
// content, never a modal. An empty `suggestions` array (including the
// enhancement-layer's own silent fetch-failure fallback, handled upstream
// in api-client.ts's getCourseRefocusSuggestions) renders nothing here —
// no error banner, no stuck loading state, since this component never
// fetches on its own.
export function CourseRefocusBanner({
  suggestions,
}: {
  suggestions: CourseRefocusSuggestion[]
}) {
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(new Set())
  const [errorKey, setErrorKey] = useState<string | null>(null)

  const visible = suggestions.filter((suggestion) => !dismissedKeys.has(suggestionKey(suggestion)))

  if (visible.length === 0) {
    return null
  }

  async function handleDismiss(suggestion: CourseRefocusSuggestion) {
    const key = suggestionKey(suggestion)

    setErrorKey(null)

    try {
      await dismissCourseRefocusSuggestion({
        data: { curriculumId: suggestion.curriculumId, reason: suggestion.reason },
      })
      setDismissedKeys((prev) => new Set(prev).add(key))
    } catch {
      // architecture.md's failure-mode posture: a user-initiated write
      // failure stays visible with an inline error, unlike the silent
      // fetch-failure fallback above — never swallowed.
      setErrorKey(key)
    }
  }

  return (
    <div className="mb-8 space-y-2" data-testid="course-refocus-banner">
      {visible.map((suggestion) => {
        const key = suggestionKey(suggestion)

        return (
          <div
            key={key}
            data-testid={`course-refocus-card-${key}`}
            className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span>
              <strong>{suggestion.curriculumName}</strong>{' '}
              {REASON_COPY[suggestion.reason](suggestion)}.
              {errorKey === key ? (
                <span
                  data-testid={`course-refocus-error-${key}`}
                  className="ml-2 text-red-600"
                >
                  Couldn't dismiss — try again.
                </span>
              ) : null}
            </span>
            <button
              type="button"
              data-testid={`course-refocus-dismiss-${key}`}
              onClick={() => void handleDismiss(suggestion)}
              className="shrink-0 font-medium text-amber-700 hover:text-amber-900"
            >
              Dismiss
            </button>
          </div>
        )
      })}
    </div>
  )
}
