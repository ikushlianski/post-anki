import { ClientOnly, Link, createFileRoute, notFound } from '@tanstack/react-router'

import { getBoard } from '../curriculum/curriculum.api'
import { BatchPractice } from '../practice/batch-practice'
import { LevelSelect } from '../practice/level-select'
import { PackSelect } from '../practice/pack-select'
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
    await getPracticeSettings({ data: params.subjectId })

    return { subject }
  },
})

function PracticePage() {
  const { subject } = Route.useLoaderData()

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
        <PracticeBody key={subject.id} subjectId={subject.id} />
      </ClientOnly>
    </main>
  )
}

function PracticeBody({ subjectId }: { subjectId: string }) {
  const settings = usePracticeSettings(subjectId)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <LevelSelect subjectId={subjectId} />
        <PackSelect subjectId={subjectId} />
      </div>
      <BatchPractice subjectId={subjectId} level={settings?.level} pack={settings?.pack} />
    </div>
  )
}
