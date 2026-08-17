import { createFileRoute } from '@tanstack/react-router'

import { MilestonesGallery } from '../milestone/milestones-gallery'
import { listMilestones } from '../milestone/milestone.api'

export const Route = createFileRoute('/milestones')({
  component: MilestonesPage,
  loader: async () => {
    const result = await listMilestones()

    return { milestones: result.ok ? result.data : [] }
  },
})

function MilestonesPage() {
  const { milestones } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Milestones</h1>
        <p className="mt-1 text-sm text-neutral-500">
          What's already fully mastered. Nothing here is ever revoked.
        </p>
      </header>

      <MilestonesGallery milestones={milestones} />
    </main>
  )
}
