import { ClientOnly, Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'

import type { PracticeSettings } from '@post-anki/shared'

import { getBoard } from '../curriculum/curriculum.api'
import { BatchPractice } from '../practice/batch-practice'
import { LevelSelect } from '../practice/level-select'
import { PackSelect } from '../practice/pack-select'
import { phraseBankQuery, PhraseBankPanel } from '../practice/phrase-bank-panel'
import { getPracticeSettings } from '../practice/practice.api'
import { usePracticeSettings } from '../practice/use-practice-settings'

export const Route = createFileRoute('/practice/$subjectId')({
  component: PracticePage,
  loader: async ({ params }) => {
    const { subjects } = await getBoard()
    const subject = subjects.find((candidate) => candidate.id === params.subjectId)

    if (!subject || subject.kind !== 'language-practice') {
      throw notFound()
    }

    // Guarantees the settings row exists before the pills ever try to read
    // it via Electric sync — getOrCreatePracticeSettings upserts on first
    // read, so this call is what makes SCENARIO 1's "no scenery" case work.
    // The result is threaded through as initialSettings (rather than
    // discarded) so the pills and the generate effect can seed themselves
    // from it immediately, without waiting on Electric to redeliver the same
    // row — the same gap that used to leave batch generation permanently
    // gated on a live query that may never resolve.
    const initialSettings = await getPracticeSettings({ data: params.subjectId })

    return { subject, initialSettings }
  },
})

function PracticePage() {
  const { subject, initialSettings } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← All curricula
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">{subject.name}</h1>
      </header>

      <ClientOnly fallback={<p className="text-neutral-500">Loading…</p>}>
        {/* Keyed on subjectId: usePracticeBatch's reset effect is keyed on
            [level, pack], not subjectId, so navigating directly between two
            practice pages (without the board unmounting this tree in
            between) would otherwise keep the previous subject's batchId and
            never regenerate for the new subject. Forcing a remount here is
            simpler and safer than growing the ported hook's guard logic to
            cover a case the source app never had (subject-scoped batches). */}
        <PracticeBody key={subject.id} subjectId={subject.id} initialSettings={initialSettings} />
      </ClientOnly>
    </main>
  )
}

function PracticeBody({
  subjectId,
  initialSettings,
}: {
  subjectId: string
  initialSettings: PracticeSettings
}) {
  const settings = usePracticeSettings(subjectId, initialSettings)
  const queryClient = useQueryClient()

  function refreshPhraseBank() {
    // The Phrase Bank panel is a plain REST GET, deliberately not synced
    // through Electric (decision 9 in architecture.md) — a grading pass
    // that touched tracked phrases invalidates it explicitly instead of
    // relying on live sync to pick up the change.
    void queryClient.invalidateQueries({ queryKey: phraseBankQuery(subjectId).queryKey })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <LevelSelect subjectId={subjectId} initialSettings={initialSettings} />
        <PackSelect subjectId={subjectId} initialSettings={initialSettings} />
      </div>
      <BatchPractice
        subjectId={subjectId}
        level={settings?.level}
        pack={settings?.pack}
        onPhraseBankUpdates={refreshPhraseBank}
      />
      <PhraseBankPanel subjectId={subjectId} />
    </div>
  )
}
