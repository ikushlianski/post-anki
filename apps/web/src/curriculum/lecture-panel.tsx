import { useState } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Lecture, LectureSourceCandidate } from './model'
import {
  compileLecture,
  gatherLectureSources,
  getLecture,
  listLectureSourceCandidates,
  reviewLectureSourceCandidate,
} from './lecture.api'

function lectureQuery(topicId: string) {
  return queryOptions({
    queryKey: ['lecture', topicId] as const,
    queryFn: () => getLecture({ data: topicId }),
    refetchInterval: (query) =>
      query.state.data?.status === 'generating' ? 2000 : false,
  })
}

function lectureCandidatesQuery(topicId: string) {
  return queryOptions({
    queryKey: ['lecture-candidates', topicId] as const,
    queryFn: () => listLectureSourceCandidates({ data: topicId }),
  })
}

export function LecturePanel({ topicId }: { topicId: string }) {
  const queryClient = useQueryClient()
  const { data: lecture, isLoading } = useQuery(lectureQuery(topicId))

  function invalidateLecture() {
    return queryClient.invalidateQueries({ queryKey: lectureQuery(topicId).queryKey })
  }

  if (isLoading) {
    return (
      <div
        className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500"
        data-testid="lecture-loading"
      >
        Checking for a lecture…
      </div>
    )
  }

  if (!lecture) {
    return <LectureStart topicId={topicId} onCompiled={invalidateLecture} />
  }

  if (lecture.status === 'generating') {
    return (
      <div
        className="rounded-lg border border-neutral-300 bg-white p-6 text-center"
        data-testid="lecture-generating"
      >
        <p className="text-sm font-medium text-neutral-700">
          Compiling the lecture…
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
          This refreshes on its own — no need to reload.
        </p>
      </div>
    )
  }

  if (lecture.status === 'failed') {
    return <LectureFailed topicId={topicId} onRetried={invalidateLecture} />
  }

  return <LectureReady lecture={lecture} />
}

function LectureStart({
  topicId,
  onCompiled,
}: {
  topicId: string
  onCompiled: () => void
}) {
  const [needsManualReview, setNeedsManualReview] = useState(false)

  const compileMutation = useMutation({
    mutationFn: () => compileLecture({ data: topicId }),
    onSuccess: onCompiled,
    onError: () => setNeedsManualReview(true),
  })

  if (needsManualReview) {
    return <LectureGatherReview topicId={topicId} onCompiled={onCompiled} />
  }

  return (
    <div
      className="rounded-lg border border-neutral-200 bg-white p-6 text-center"
      data-testid="lecture-start"
    >
      <p className="text-sm font-medium text-neutral-700">
        No lecture for this topic yet.
      </p>
      <button
        type="button"
        data-testid="lecture-compile-start-button"
        disabled={compileMutation.isPending}
        onClick={() => compileMutation.mutate()}
        className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {compileMutation.isPending ? 'Compiling…' : 'Compile lecture'}
      </button>
    </div>
  )
}

function LectureGatherReview({
  topicId,
  onCompiled,
}: {
  topicId: string
  onCompiled: () => void
}) {
  const queryClient = useQueryClient()
  const candidatesQueryKey = lectureCandidatesQuery(topicId).queryKey
  const { data: candidates, isLoading } = useQuery(lectureCandidatesQuery(topicId))

  const gatherMutation = useMutation({
    mutationFn: () => gatherLectureSources({ data: topicId }),
    onSuccess: (result) => {
      queryClient.setQueryData(candidatesQueryKey, result)
    },
  })

  const reviewMutation = useMutation({
    mutationFn: (input: { candidateId: string; reviewStatus: 'approved' | 'rejected' }) =>
      reviewLectureSourceCandidate({ data: input }),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<LectureSourceCandidate[] | undefined>(
        candidatesQueryKey,
        (prev) =>
          prev?.map((candidate) =>
            candidate.id === variables.candidateId
              ? { ...candidate, reviewStatus: variables.reviewStatus }
              : candidate,
          ),
      )
    },
  })

  const compileMutation = useMutation({
    mutationFn: () => compileLecture({ data: topicId }),
    onSuccess: onCompiled,
  })

  const approvedCount =
    candidates?.filter((candidate) => candidate.reviewStatus === 'approved').length ?? 0

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-neutral-800">Lecture sources</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Find candidate sources, then approve the ones worth reading before
              compiling a lecture.
            </p>
          </div>
          <button
            type="button"
            data-testid="lecture-gather-sources-button"
            disabled={gatherMutation.isPending}
            onClick={() => gatherMutation.mutate()}
            className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {gatherMutation.isPending ? 'Finding sources…' : 'Find lecture sources'}
          </button>
        </div>

        {gatherMutation.isError ? (
          <p className="mt-2 text-xs text-amber-700">
            Couldn’t gather sources right now. Try again.
          </p>
        ) : null}
      </div>

      {isLoading ? null : candidates && candidates.length > 0 ? (
        <ul className="space-y-2" data-testid="lecture-candidate-list">
          {candidates.map((candidate) => (
            <li
              key={candidate.id}
              data-testid="lecture-source-candidate"
              data-candidate-id={candidate.id}
              data-review-status={candidate.reviewStatus}
              className="rounded-lg border border-neutral-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="text-sm font-medium text-neutral-800"
                    data-testid="lecture-source-candidate-title"
                  >
                    {candidate.title}
                  </p>
                  <a
                    href={candidate.url}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="lecture-source-candidate-url"
                    className="text-xs text-neutral-500 underline"
                  >
                    {candidate.url}
                  </a>
                  <p
                    className="mt-1 text-xs text-neutral-500"
                    data-testid="lecture-source-candidate-reason"
                  >
                    {candidate.whySelected}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${reviewStatusClass(candidate.reviewStatus)}`}
                >
                  {candidate.reviewStatus}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-testid="lecture-source-candidate-approve"
                  disabled={reviewMutation.isPending}
                  onClick={() =>
                    reviewMutation.mutate({
                      candidateId: candidate.id,
                      reviewStatus: 'approved',
                    })
                  }
                  className={approveButtonClass(candidate.reviewStatus === 'approved')}
                >
                  Approve
                </button>
                <button
                  type="button"
                  data-testid="lecture-source-candidate-reject"
                  disabled={reviewMutation.isPending}
                  onClick={() =>
                    reviewMutation.mutate({
                      candidateId: candidate.id,
                      reviewStatus: 'rejected',
                    })
                  }
                  className={rejectButtonClass(candidate.reviewStatus === 'rejected')}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-neutral-400" data-testid="lecture-candidates-empty">
          No candidate sources yet — find some above.
        </p>
      )}

      <button
        type="button"
        data-testid="lecture-compile-button"
        disabled={approvedCount === 0 || compileMutation.isPending}
        onClick={() => compileMutation.mutate()}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {compileMutation.isPending ? 'Compiling…' : 'Compile lecture'}
      </button>

      {compileMutation.isError ? (
        <p className="text-xs text-amber-700">
          Couldn’t start compiling the lecture. Try again.
        </p>
      ) : null}
    </div>
  )
}

function LectureFailed({
  topicId,
  onRetried,
}: {
  topicId: string
  onRetried: () => void
}) {
  const retryMutation = useMutation({
    mutationFn: () => compileLecture({ data: topicId }),
    onSuccess: onRetried,
  })

  return (
    <div
      className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center"
      data-testid="lecture-status-failed"
    >
      <p className="text-sm font-medium text-amber-800">
        The mentor couldn’t compile this lecture.
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-amber-700">
        The compiling step may have timed out or failed. Retry to try again.
      </p>
      <button
        type="button"
        data-testid="lecture-retry-button"
        disabled={retryMutation.isPending}
        onClick={() => retryMutation.mutate()}
        className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {retryMutation.isPending ? 'Retrying…' : 'Retry compile'}
      </button>
    </div>
  )
}

function LectureReady({ lecture }: { lecture: Lecture }) {
  const sections = [...lecture.sections].sort((a, b) => a.order - b.order)

  return (
    <article data-testid="lecture-ready" className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{lecture.title}</h1>

      <div className="space-y-5">
        {sections.map((section) => (
          <section key={section.id} data-testid="lecture-section">
            <h2
              className="text-lg font-medium text-neutral-800"
              data-testid="lecture-section-heading"
            >
              {section.heading}
            </h2>
            <p
              className="mt-1 whitespace-pre-wrap text-sm text-neutral-600"
              data-testid="lecture-section-body"
            >
              {section.body}
            </p>
          </section>
        ))}
      </div>

      {lecture.citations.length > 0 ? (
        <div className="border-t border-neutral-200 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Sources
          </p>
          <ul className="mt-2 space-y-1" data-testid="lecture-citations">
            {lecture.citations.map((citation) => (
              <li key={citation.id} data-testid="lecture-citation">
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-neutral-700 underline"
                >
                  {citation.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}

function reviewStatusClass(status: LectureSourceCandidate['reviewStatus']): string {
  if (status === 'approved') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (status === 'rejected') {
    return 'bg-neutral-200 text-neutral-500'
  }

  return 'bg-amber-100 text-amber-700'
}

function approveButtonClass(active: boolean): string {
  return `rounded-md border px-3 py-1 text-xs font-medium ${
    active
      ? 'border-emerald-600 bg-emerald-600 text-white'
      : 'border-neutral-300 text-neutral-700 hover:border-emerald-500'
  }`
}

function rejectButtonClass(active: boolean): string {
  return `rounded-md border px-3 py-1 text-xs font-medium ${
    active
      ? 'border-neutral-500 bg-neutral-500 text-white'
      : 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
  }`
}
