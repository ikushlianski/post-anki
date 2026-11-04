import { useState } from 'react'

import { startStudySession } from './study-session.api'

export function StartPrompt({
  sessionId,
  onStarted,
}: {
  sessionId: string
  onStarted: () => void | Promise<void>
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div
      data-testid="session-start-prompt"
      className="card text-center"
    >
      <p className="mb-4 text-sm text-neutral-500">Ready when you are.</p>
      <button
        type="button"
        data-testid="session-start-button"
        onClick={() => {
          setFailed(false)
          void startStudySession({ data: sessionId })
            .then((result) => {
              if (result.ok) {
                void onStarted()
              } else {
                setFailed(true)
              }
            })
            .catch(() => setFailed(true))
        }}
        className="btn-primary"
      >
        Start session
      </button>
      {failed ? (
        <p role="alert" data-testid="session-start-failed" className="mt-3 text-xs text-red-600">
          Couldn't start the session — try again.
        </p>
      ) : null}
    </div>
  )
}
