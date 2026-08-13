import { useState } from 'react'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OpenQuestion } from '@post-anki/shared'

import { listOpenQuestions, resolveOpenQuestion } from './open-questions.api'

type View = 'open' | 'history'

export function openQuestionsQuery() {
  return queryOptions({
    queryKey: ['open-questions'] as const,
    queryFn: () => listOpenQuestions({ data: {} }),
  })
}

const STATUS_LABEL: Record<OpenQuestion['status'], string> = {
  open: 'Open',
  answered: 'Answered',
  dismissed: 'Not needed',
}

function OpenQuestionRow({
  question,
  onResolved,
}: {
  question: OpenQuestion
  onResolved: (updated: OpenQuestion) => void
}) {
  const [answerText, setAnswerText] = useState('')
  const [busy, setBusy] = useState(false)

  async function resolve(status: 'answered' | 'dismissed') {
    setBusy(true)

    try {
      const updated = await resolveOpenQuestion({
        data: {
          id: question.id,
          status,
          answerText: status === 'answered' ? answerText.trim() || undefined : undefined,
        },
      })

      onResolved(updated)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      data-testid={`open-question-row-${question.id}`}
      data-status={question.status}
      className="rounded-lg border border-neutral-200 bg-white p-4"
    >
      <p data-testid={`open-question-text-${question.id}`} className="text-sm text-neutral-800">
        {question.questionText}
      </p>

      {question.topicTitle ? (
        <p data-testid={`open-question-topic-${question.id}`} className="mt-1 text-xs text-neutral-400">
          {question.topicTitle}
        </p>
      ) : null}

      {question.status === 'open' ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={answerText}
            disabled={busy}
            onChange={(event) => setAnswerText(event.target.value)}
            placeholder="Answer this…"
            data-testid={`open-question-answer-input-${question.id}`}
            className="min-h-[3rem] rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || answerText.trim().length === 0}
              onClick={() => resolve('answered')}
              data-testid={`open-question-answer-submit-${question.id}`}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-neutral-500 disabled:opacity-50"
            >
              Answer
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => resolve('dismissed')}
              data-testid={`open-question-dismiss-${question.id}`}
              className="text-xs text-neutral-400 hover:text-neutral-700"
            >
              Not needed
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <span
            data-testid={`open-question-status-${question.id}`}
            className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500"
          >
            {STATUS_LABEL[question.status]}
          </span>
          {question.answerText ? (
            <span className="text-xs text-neutral-500">{question.answerText}</span>
          ) : null}
        </div>
      )}
    </li>
  )
}

export function OpenQuestionsList() {
  const queryClient = useQueryClient()
  const { data } = useQuery(openQuestionsQuery())
  const [view, setView] = useState<View>('open')

  const allItems = data?.items ?? []
  const items = allItems.filter((item) =>
    view === 'open' ? item.status === 'open' : item.status !== 'open',
  )

  function handleResolved(updated: OpenQuestion) {
    queryClient.setQueryData(openQuestionsQuery().queryKey, (current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        items: current.items.map((item) => (item.id === updated.id ? updated : item)),
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="open-questions-filter-open"
          onClick={() => setView('open')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            view === 'open' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
          }`}
        >
          Open
        </button>
        <button
          type="button"
          data-testid="open-questions-filter-history"
          onClick={() => setView('history')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            view === 'history' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
          }`}
        >
          Answered / dismissed
        </button>
      </div>

      {items.length === 0 ? (
        <div
          data-testid="open-questions-list-empty"
          className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500"
        >
          {view === 'open' ? 'Nothing open right now.' : 'No answered or dismissed questions yet.'}
        </div>
      ) : (
        <ul data-testid="open-questions-list" className="flex flex-col gap-3">
          {items.map((question) => (
            <OpenQuestionRow key={question.id} question={question} onResolved={handleResolved} />
          ))}
        </ul>
      )}
    </div>
  )
}
