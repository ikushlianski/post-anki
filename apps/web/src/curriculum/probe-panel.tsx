import { useEffect, useState } from 'react'

import type { Question, QuestionKind } from './model'
import { nextQuestion } from './curriculum.api'
import { ProbeAnswer } from './probe-answer'

export function ProbePanel({
  topicId,
  mode,
  onClose,
}: {
  topicId: string
  mode: QuestionKind
  onClose?: () => void
}) {
  const [question, setQuestion] = useState<Question | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      const next = await nextQuestion({ data: { topicId, mode } })
      if (active) {
        setQuestion(next)
        setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [topicId, mode])

  return (
    <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-neutral-400">
          {mode === 'socratic' ? 'Socratic probe' : 'Quick test'}
        </span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-xs text-neutral-400 hover:text-neutral-700"
          >
            Close
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-neutral-400">The mentor is choosing a gap…</p>
      ) : !question ? (
        <p className="text-sm text-neutral-500">
          Couldn’t load a question right now. Close this and try again.
        </p>
      ) : (
        <ProbeAnswer topicId={topicId} mode={mode} question={question} />
      )}
    </div>
  )
}
