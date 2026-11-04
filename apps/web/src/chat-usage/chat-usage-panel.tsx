import { useEffect, useState } from 'react'

import { chatUsageSchema, type ChatUsage } from '@post-anki/shared'
import { getChatUsage } from './chat-usage.api'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; usage: ChatUsage }

export function ChatUsagePanel() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let active = true

    getChatUsage()
      .then((raw) => {
        const parsed = chatUsageSchema.safeParse(raw)

        if (active) {
          setState(parsed.success ? { kind: 'ready', usage: parsed.data } : { kind: 'error' })
        }
      })
      .catch(() => {
        if (active) {
          setState({ kind: 'error' })
        }
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <section className="mt-8" data-testid="chat-usage-panel">
      <h2 className="text-lg font-semibold tracking-tight">Chat AI usage today</h2>
      {state.kind === 'loading' ? (
        <p role="status" data-testid="chat-usage-loading" className="mt-1 text-sm text-neutral-500">
          Loading usage...
        </p>
      ) : null}
      {state.kind === 'error' ? (
        <p role="alert" data-testid="chat-usage-error" className="mt-1 text-sm text-red-600">
          Could not load chat usage.
        </p>
      ) : null}
      {state.kind === 'ready' ? <UsageDetails usage={state.usage} /> : null}
    </section>
  )
}

function UsageDetails({ usage }: { usage: ChatUsage }) {
  const paused = usage.budgetStatus === 'paused'

  return (
    <dl className="mt-2 space-y-1 text-sm" data-testid="chat-usage-details">
      <div>
        <dt className="inline text-neutral-500">Day (UTC): </dt>
        <dd className="inline">{usage.day}</dd>
      </div>
      <div>
        <dt className="inline text-neutral-500">Chat AI calls today: </dt>
        <dd className="inline" data-testid="chat-usage-messages">{usage.calls}</dd>
      </div>
      <div>
        <dt className="inline text-neutral-500">Input tokens: </dt>
        <dd className="inline" data-testid="chat-usage-input-tokens">{usage.inputTokens}</dd>
      </div>
      <div>
        <dt className="inline text-neutral-500">Output tokens: </dt>
        <dd className="inline" data-testid="chat-usage-output-tokens">{usage.outputTokens}</dd>
      </div>
      <div>
        <dt className="inline text-neutral-500">This hour: </dt>
        <dd className="inline" data-testid="chat-usage-hourly">
          {usage.currentHourCount} of {usage.hourlyCap}
        </dd>
      </div>
      <div>
        <dt className="inline text-neutral-500">Budget status: </dt>
        <dd className="inline font-medium" data-testid="chat-usage-status">
          {paused ? 'paused' : 'ok'}
        </dd>
        {paused ? (
          <span className="ml-1 text-neutral-500">(chat replies are blocked until the cap resets)</span>
        ) : null}
      </div>
    </dl>
  )
}
