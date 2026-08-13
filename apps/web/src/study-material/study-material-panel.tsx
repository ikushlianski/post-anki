import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { StudyMaterial, StudyMaterialKind } from '@post-anki/shared'

import { hasGeneratingMaterial } from './study-material-status'
import { StudyMaterialHistory } from './study-material-history'
import { listStudyMaterials, requestStudyMaterial } from './study-material.api'

function studyMaterialsQuery(topicId: string) {
  return queryOptions({
    queryKey: ['study-materials', topicId] as const,
    queryFn: async (): Promise<StudyMaterial[]> => {
      const result = await listStudyMaterials({ data: topicId })

      return result.ok ? result.data : []
    },
    refetchInterval: (query) =>
      hasGeneratingMaterial(query.state.data ?? []) ? 2000 : false,
  })
}

const KINDS: Array<{ value: StudyMaterialKind; label: string }> = [
  { value: 'worked_example', label: 'Request a worked example' },
  { value: 'analogy', label: 'Request an analogy' },
]

export function StudyMaterialPanel({ topicId }: { topicId: string }) {
  const queryClient = useQueryClient()
  const { data: materials } = useQuery(studyMaterialsQuery(topicId))

  const requestMutation = useMutation({
    mutationFn: (kind: StudyMaterialKind) => requestStudyMaterial({ data: { topicId, kind } }),
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: studyMaterialsQuery(topicId).queryKey })
      }
    },
  })

  return (
    <section className="space-y-4" data-testid="study-material-panel">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm font-medium text-neutral-800">Study material</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          Ask for a worked example or an analogy for this topic — nothing is
          generated unless you ask.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              data-testid={`study-material-request-${option.value}`}
              disabled={requestMutation.isPending}
              onClick={() => requestMutation.mutate(option.value)}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {requestMutation.isPending ? 'Requesting…' : option.label}
            </button>
          ))}
        </div>

        {requestMutation.data && !requestMutation.data.ok ? (
          <p
            role="alert"
            data-testid="study-material-request-error"
            className="mt-2 text-xs text-amber-700"
          >
            {requestMutation.data.message ?? "Couldn't start the request. Try again."}
          </p>
        ) : null}
      </div>

      <StudyMaterialHistory materials={materials ?? []} />
    </section>
  )
}
