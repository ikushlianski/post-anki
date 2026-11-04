import { createFileRoute, useRouter } from '@tanstack/react-router'

import { MilestonesGallery } from '../milestone/milestones-gallery'
import { listMilestones } from '../milestone/milestone.api'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/milestones')({
  head: pageHead('Milestones'),
  component: MilestonesPage,
  loader: async () => {
    const result = await listMilestones()

    return result.ok
      ? { milestones: result.data, loadFailed: false }
      : { milestones: [], loadFailed: true }
  },
})

function MilestonesPage() {
  const { milestones, loadFailed } = Route.useLoaderData()
  const router = useRouter()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Milestones</h1>
        <p className="mt-1 text-sm text-neutral-500">
          What's already fully mastered. Nothing here is ever revoked.
        </p>
      </header>

      <MilestonesGallery
        milestones={milestones}
        loadFailed={loadFailed}
        onRetry={() => void router.invalidate()}
      />
    </main>
  )
}
