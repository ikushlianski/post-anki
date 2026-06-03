import { useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import type { DecideResult } from '../curriculum/model'
import { decide } from '../curriculum/curriculum.api'

export const Route = createFileRoute('/decide')({
  component: DecidePage,
})

function DecidePage() {
  const [decision, setDecision] = useState('')
  const [opinion, setOpinion] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DecideResult | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (!decision.trim() || !opinion.trim()) {
      return
    }

    setBusy(true)
    const res = await decide({
      data: { decision: decision.trim(), opinion: opinion.trim() },
    })
    setResult(res)
    setBusy(false)
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Pressure-test a decision
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Form your own opinion first, then let the mentor challenge it — you
          get strengths, blind spots, and the questions you haven’t asked.
        </p>
      </header>

      <form
        onSubmit={submit}
        className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
      >
        <div>
          <label className="text-xs text-neutral-400">
            The decision you’re facing
          </label>
          <textarea
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
            placeholder="e.g. Should we move sessions from JWTs to server-side sessions?"
            rows={2}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-400">
            Your opinion — what you’d do and why
          </label>
          <textarea
            value={opinion}
            onChange={(event) => setOpinion(event.target.value)}
            placeholder="Say where you currently lean and your reasoning."
            rows={4}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Evaluating…' : 'Challenge my thinking'}
        </button>
      </form>

      {result ? (
        <div className="mt-6 space-y-5">
          <div className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-3 text-sm text-white">
            <span className="text-neutral-400">Verdict · </span>
            {result.verdict}
          </div>
          <DecideList title="Strengths" items={result.strengths} />
          <DecideList title="Blind spots" items={result.blindSpots} />
          <DecideList
            title="Questions to sit with"
            items={result.questions}
          />
        </div>
      ) : null}
    </main>
  )
}

function DecideList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {title}
      </h2>
      <ul className="space-y-1.5 text-sm text-neutral-700">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="text-neutral-400">·</span>
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}
