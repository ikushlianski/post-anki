import { createFileRoute, useRouter } from '@tanstack/react-router'

import { getBoard } from '../curriculum/curriculum.api'
import { CaptureForm } from '../learning-list/capture-form'
import { LearningListPanel } from '../learning-list/learning-list-panel'
import {
  captureLearningListItem,
  listLearningListItems,
  resolveRecommendation,
} from '../learning-list/learning-list.api'

export const Route = createFileRoute('/learning-list')({
  component: LearningListPage,
  loader: async () => {
    const [items, board] = await Promise.all([
      listLearningListItems(),
      getBoard(),
    ])

    return { items, subjects: board.subjects }
  },
})

function LearningListPage() {
  const { items, subjects } = Route.useLoaderData()
  const router = useRouter()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Learning list</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everything you captured, with how alive it is. Nothing disappears from
          here — items you set aside stay listed, greyed out.
        </p>
      </header>

      <div className="mb-6">
        <CaptureForm
          subjects={subjects.map((subject) => ({
            id: subject.id,
            name: subject.name,
          }))}
          onCapture={(data) => captureLearningListItem({ data })}
          onCaptured={() => router.invalidate()}
        />
      </div>

      <LearningListPanel
        items={items}
        onResolve={(data) => resolveRecommendation({ data })}
        onResolved={() => router.invalidate()}
      />
    </main>
  )
}
