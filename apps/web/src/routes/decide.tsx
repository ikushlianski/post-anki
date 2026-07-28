import { ClientOnly, createFileRoute } from '@tanstack/react-router'

import { Decide } from '../decide/decide'

export const Route = createFileRoute('/decide')({
  component: DecidePage,
})

function DecidePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Pressure-test a decision</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Form your own opinion first, then let the mentor challenge it — you get strengths, blind
          spots, and the questions you haven't asked.
        </p>
      </header>

      <ClientOnly fallback={<p className="text-neutral-500">Loading…</p>}>
        <Decide />
      </ClientOnly>
    </main>
  )
}
