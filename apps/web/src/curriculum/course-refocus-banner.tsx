import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { dismissCourseRefocusSuggestion } from './api-client'
import type { CourseRefocusSuggestion } from './model'

interface CourseRefocusBannerProps {
  suggestions: CourseRefocusSuggestion[]
  onRefresh?: () => void
}

export function CourseRefocusBanner({ suggestions, onRefresh }: CourseRefocusBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const dismissMutation = useMutation({
    mutationFn: ({ curriculumId, reason }: { curriculumId: string; reason: string }) =>
      dismissCourseRefocusSuggestion(curriculumId, reason),
    onSuccess: (_, { curriculumId }) => {
      setDismissedIds((prev) => new Set(prev).add(curriculumId))
      onRefresh?.()
    },
  })

  const visibleSuggestions = suggestions.filter((s) => !dismissedIds.has(s.curriculumId))

  if (visibleSuggestions.length === 0) {
    return null
  }

  const reasonLabel = (reason: string): string => {
    if (reason === 'stale_top_priority') {
      return 'You haven\'t studied this course in a while'
    }
    if (reason === 'new_high_priority_ignored') {
      return 'This is a new, high-priority course you haven\'t started yet'
    }
    return reason
  }

  return (
    <div className="space-y-2">
      {visibleSuggestions.map((suggestion) => (
        <div
          key={suggestion.curriculumId}
          className="rounded-lg border border-amber-200 bg-amber-50 p-4"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900">{suggestion.courseName}</h3>
              <p className="text-sm text-amber-800">{suggestion.subjectName}</p>
              <p className="mt-1 text-sm text-amber-700">{reasonLabel(suggestion.reason)}</p>
            </div>
            <button
              onClick={() => {
                dismissMutation.mutate({
                  curriculumId: suggestion.curriculumId,
                  reason: suggestion.reason,
                })
              }}
              disabled={dismissMutation.isPending}
              className="ml-4 flex-shrink-0 text-sm font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
