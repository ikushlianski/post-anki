import { useEffect, useState } from 'react'
import { examSecondsRemaining, formatRemaining } from './exam-timer'

export function ExamCountdown({
  createdAt,
  total,
  onExpire,
}: {
  createdAt: string
  total: number
  onExpire: () => void
}) {
  const [remaining, setRemaining] = useState(() =>
    examSecondsRemaining(createdAt, total, Date.now()),
  )

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(examSecondsRemaining(createdAt, total, Date.now()))
    }, 1000)

    return () => clearInterval(id)
  }, [createdAt, total])

  useEffect(() => {
    if (remaining <= 0) {
      onExpire()
    }
  }, [remaining, onExpire])

  return (
    <div
      data-testid="exam-timer"
      className="mb-3 flex items-center justify-between rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
    >
      <span className="font-medium text-neutral-700">Time remaining</span>
      <span
        data-testid="exam-timer-value"
        className={remaining <= 30 ? 'font-mono text-amber-700' : 'font-mono text-neutral-700'}
      >
        {formatRemaining(remaining)}
      </span>
    </div>
  )
}
