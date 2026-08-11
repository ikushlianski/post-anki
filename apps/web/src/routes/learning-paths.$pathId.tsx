import { Link, createFileRoute, useRouter } from '@tanstack/react-router'

import { getBoard } from '../curriculum/curriculum.api'
import { captureLearningListItem } from '../learning-list/learning-list.api'
import { LearningPathDetail } from '../learning-path/learning-path-detail'
import {
  abandonLearningPath,
  getLearningPath,
  getLearningPathStepPush,
  listRoleTemplates,
} from '../learning-path/learning-path.api'

export const Route = createFileRoute('/learning-paths/$pathId')({
  component: LearningPathDetailPage,
  loader: async ({ params }) => {
    const [detailResult, templates, board] = await Promise.all([
      getLearningPath({ data: params.pathId }),
      listRoleTemplates(),
      getBoard(),
    ])

    return { detailResult, templates, subjects: board.subjects }
  },
})

function LearningPathDetailPage() {
  const { detailResult, templates, subjects } = Route.useLoaderData()
  const { pathId } = Route.useParams()
  const router = useRouter()

  if (!detailResult.ok) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm text-neutral-500">Learning path not found.</p>
        <Link to="/learning-paths" className="text-sm underline">
          Back to learning paths
        </Link>
      </main>
    )
  }

  const { path, steps, progress, nextStepDomainNodeId } = detailResult.data

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link
        to="/learning-paths"
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← All learning paths
      </Link>

      <div className="mt-3">
        <LearningPathDetail
          path={path}
          steps={steps}
          progress={progress}
          nextStepDomainNodeId={nextStepDomainNodeId}
          templates={templates}
          subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name }))}
          onLoadStepPush={(stepDomainNodeId) =>
            getLearningPathStepPush({ data: { pathId, stepDomainNodeId } })
          }
          onAbandon={() => abandonLearningPath({ data: pathId })}
          onAbandoned={() => router.invalidate()}
          onCapture={(data) => captureLearningListItem({ data })}
          onCaptured={() => router.invalidate()}
        />
      </div>
    </main>
  )
}
