import { createFileRoute, useRouter } from '@tanstack/react-router'

import { LearningPathList } from '../learning-path/learning-path-list'
import { RoleTemplateBrowser } from '../learning-path/role-template-browser'
import {
  createLearningPath,
  listLearningPaths,
  listRoleTemplates,
} from '../learning-path/learning-path.api'

export const Route = createFileRoute('/learning-paths')({
  component: LearningPathsPage,
  loader: async () => {
    const [templates, paths] = await Promise.all([
      listRoleTemplates(),
      listLearningPaths({ data: { onlyActive: false } }),
    ])

    return { templates, paths }
  },
})

function LearningPathsPage() {
  const { templates, paths } = Route.useLoaderData()
  const router = useRouter()

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Learning paths</h1>
        <p className="mt-1 text-sm text-neutral-500">
          An ordered route through a role's Areas. Order suggests what's next — every
          step stays directly open, nothing is ever locked.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Start a path
        </h2>
        <RoleTemplateBrowser
          templates={templates}
          onStart={(roleTemplateId) =>
            createLearningPath({ data: { roleTemplateId } })
          }
          onStarted={(pathId) =>
            router.navigate({ to: '/learning-paths/$pathId', params: { pathId } })
          }
        />
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Your paths
        </h2>
        <LearningPathList paths={paths} />
      </section>
    </main>
  )
}
