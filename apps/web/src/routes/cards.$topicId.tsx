import { Link, createFileRoute } from '@tanstack/react-router'

import { CardPanel } from '../curriculum/card-panel'

export const Route = createFileRoute('/cards/$topicId')({
  component: CardsPage,
})

function CardsPage() {
  const { topicId } = Route.useParams()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/" className="text-sm text-neutral-500 underline">
        Back to curricula
      </Link>
      <div className="mt-4">
        <CardPanel topicId={topicId} />
      </div>
    </main>
  )
}
