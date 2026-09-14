import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'

import type { Subject } from '../curriculum/model'
import { getBoard } from '../curriculum/curriculum.api'
import { updateSubjectName } from '../subject/subject.api'
import { DeleteSubjectButton, SubjectSection } from '../subject/subject-section'
import { RenameButton } from '../curriculum/shape-controls'
import { useHydrated } from '../shared/use-hydrated'

export const Route = createFileRoute('/subject/$subjectId')({
  component: SubjectDetailPage,
  loader: async ({ params }) => {
    const board = await getBoard()
    const subject = board.subjects.find((s) => s.id === params.subjectId) ?? null

    return {
      subject,
      subjects: board.subjects,
      curricula: board.curricula,
      categories: board.categories,
    }
  },
})

function SubjectDetailPage() {
  const { subject, subjects, curricula, categories } = Route.useLoaderData()

  if (!subject) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm text-neutral-500">Subject not found.</p>
        <Link to="/" className="text-sm underline">
          Back to dashboard
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← All subjects
      </Link>

      <header className="mb-6 mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{subject.name}</h1>
          <RenameSubjectButton subject={subject} />
        </div>
        <DeleteSubjectButton subjectId={subject.id} />
      </header>

      <SubjectSection
        subject={subject}
        curricula={curricula.filter((c) => c.subjectId === subject.id)}
        allSubjects={subjects}
        categories={categories.filter((c) => c.subjectId === subject.id)}
        allCategories={categories}
      />
    </main>
  )
}

function RenameSubjectButton({ subject }: { subject: Subject }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveName(next: string): Promise<boolean> {
    setBusy(true)
    setError(null)

    try {
      await updateSubjectName({ data: { subjectId: subject.id, name: next } })
      await router.invalidate()
      return true
    } catch {
      setError('Rename failed — try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <RenameButton
      value={subject.name}
      busy={busy}
      hydrated={hydrated}
      onSave={saveName}
      error={error}
      testId={`subject-rename-${subject.id}`}
    />
  )
}
