import { useState } from 'react'
import type { PendingPlacementSuggestion } from '@post-anki/shared'
import type { Curriculum, Module, Subject } from '../curriculum/model'

import { resolvePlacementSuggestionStatus } from './knowledge-bit.api'
import { getCurriculum } from '../curriculum/curriculum.api'
import { useResolvingSuggestions } from '../domain-map/use-resolving-suggestions'

interface Picker {
  subjectId: string
  curriculumId: string
  moduleId: string
  title: string
}

function emptyPicker(suggestion?: PendingPlacementSuggestion): Picker {
  return { subjectId: '', curriculumId: '', moduleId: '', title: suggestion?.placementSuggestion ?? '' }
}

function initialPickers(suggestions: PendingPlacementSuggestion[]): Record<string, Picker> {
  return Object.fromEntries(suggestions.map((s) => [s.id, emptyPicker(s)]))
}

export function PlacementSuggestionsPanel({
  initialSuggestions,
  subjects,
  curricula,
}: {
  initialSuggestions: PendingPlacementSuggestion[]
  subjects: Subject[]
  curricula: Curriculum[]
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [pickers, setPickers] = useState<Record<string, Picker>>(() =>
    initialPickers(initialSuggestions),
  )
  const [modulesByCurriculum, setModulesByCurriculum] = useState<Record<string, Module[]>>({})
  const [loadingCurriculumIds, setLoadingCurriculumIds] = useState<ReadonlySet<string>>(new Set())
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const { claim, release, isResolving } = useResolvingSuggestions()

  function picker(bitId: string): Picker {
    return pickers[bitId] ?? emptyPicker()
  }

  function updatePicker(bitId: string, patch: Partial<Picker>) {
    setPickers((prev) => ({ ...prev, [bitId]: { ...(prev[bitId] ?? emptyPicker()), ...patch } }))
  }

  async function selectCurriculum(bitId: string, curriculumId: string) {
    updatePicker(bitId, { curriculumId, moduleId: '' })

    if (!curriculumId || modulesByCurriculum[curriculumId]) {
      return
    }

    setLoadingCurriculumIds((prev) => new Set(prev).add(curriculumId))

    try {
      const detail = await getCurriculum({ data: curriculumId })
      setModulesByCurriculum((prev) => ({ ...prev, [curriculumId]: detail?.modules ?? [] }))
    } catch {
      // Module dropdown just stays empty; the curriculum select can be retried.
    } finally {
      setLoadingCurriculumIds((prev) => {
        const next = new Set(prev)
        next.delete(curriculumId)
        return next
      })
    }
  }

  async function accept(bitId: string) {
    const state = picker(bitId)

    if (!state.moduleId || !state.title.trim() || !claim(bitId)) {
      return
    }

    try {
      const result = await resolvePlacementSuggestionStatus({
        data: { bitId, status: 'accepted', moduleId: state.moduleId, title: state.title.trim() },
      })

      setSuggestions((prev) => prev.filter((item) => item.id !== bitId))

      if (result.outcome === 'accepted') {
        const moduleTitle =
          modulesByCurriculum[state.curriculumId]?.find((m) => m.id === state.moduleId)?.title ??
          state.moduleId
        setConfirmation(`Topic "${state.title.trim()}" created under ${moduleTitle}`)
        setTimeout(() => setConfirmation(null), 4000)
      }
    } catch {
      // Row stays in the list on failure so the decision can be retried.
    } finally {
      release(bitId)
    }
  }

  async function reject(bitId: string) {
    if (!claim(bitId)) {
      return
    }

    try {
      await resolvePlacementSuggestionStatus({ data: { bitId, status: 'rejected' } })

      setSuggestions((prev) => prev.filter((item) => item.id !== bitId))
    } catch {
      // Same retry posture as accept above.
    } finally {
      release(bitId)
    }
  }

  return (
    <div data-testid="placement-suggestions-panel" className="space-y-4">
      {confirmation ? <p className="text-sm text-emerald-700">{confirmation}</p> : null}

      {suggestions.length === 0 ? (
        <p data-testid="placement-suggestions-empty-state" className="text-sm text-neutral-500">
          No pending placement suggestions.
        </p>
      ) : (
        <ul className="space-y-3">
          {suggestions.map((suggestion) => {
            const state = picker(suggestion.id)
            const subjectCurricula = curricula.filter((c) => c.subjectId === state.subjectId)
            const modules = modulesByCurriculum[state.curriculumId] ?? []

            return (
              <li
                key={suggestion.id}
                data-testid={`placement-suggestion-${suggestion.id}`}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <p className="text-sm">{suggestion.body}</p>
                <p
                  data-testid={`placement-suggestion-reason-${suggestion.id}`}
                  className="mt-1 text-xs text-neutral-600"
                >
                  {suggestion.placementSuggestion}
                </p>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <select
                    data-testid={`placement-suggestion-subject-${suggestion.id}`}
                    value={state.subjectId}
                    onChange={(e) =>
                      updatePicker(suggestion.id, {
                        subjectId: e.target.value,
                        curriculumId: '',
                        moduleId: '',
                      })
                    }
                    className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                  >
                    <option value="">Subject…</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>

                  <select
                    data-testid={`placement-suggestion-curriculum-${suggestion.id}`}
                    value={state.curriculumId}
                    disabled={!state.subjectId}
                    onChange={(e) => selectCurriculum(suggestion.id, e.target.value)}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  >
                    <option value="">Curriculum…</option>
                    {subjectCurricula.map((curriculum) => (
                      <option key={curriculum.id} value={curriculum.id}>
                        {curriculum.name}
                      </option>
                    ))}
                  </select>

                  <select
                    data-testid={`placement-suggestion-module-${suggestion.id}`}
                    value={state.moduleId}
                    disabled={!state.curriculumId || loadingCurriculumIds.has(state.curriculumId)}
                    onChange={(e) => updatePicker(suggestion.id, { moduleId: e.target.value })}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                  >
                    <option value="">
                      {loadingCurriculumIds.has(state.curriculumId) ? 'Loading…' : 'Module…'}
                    </option>
                    {modules.map((module) => (
                      <option key={module.id} value={module.id}>
                        {module.title}
                      </option>
                    ))}
                  </select>

                  <input
                    data-testid={`placement-suggestion-title-${suggestion.id}`}
                    type="text"
                    placeholder="New topic title"
                    value={state.title}
                    onChange={(e) => updatePicker(suggestion.id, { title: e.target.value })}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                  />
                </div>

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    data-testid={`placement-suggestion-accept-${suggestion.id}`}
                    disabled={
                      isResolving(suggestion.id) || !state.moduleId || !state.title.trim()
                    }
                    onClick={() => accept(suggestion.id)}
                    className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    data-testid={`placement-suggestion-reject-${suggestion.id}`}
                    disabled={isResolving(suggestion.id)}
                    onClick={() => reject(suggestion.id)}
                    className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
