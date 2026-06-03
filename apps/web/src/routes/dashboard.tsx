import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'

import type {
  DashboardCurriculum,
  DashboardSubject,
  LearningStatus,
  Module,
  Topic,
} from '../curriculum/model'
import {
  getTree,
  setCurriculumStatus,
  setModuleStatus,
  setTopicState,
} from '../curriculum/curriculum.api'
import { LearningStatusSelect } from '../curriculum/learning-status'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
  loader: () => getTree(),
})

function DashboardPage() {
  const tree = Route.useLoaderData()
  const focus = findFocus(tree)

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everything you're learning and where each piece stands. Change any
          status to re-steer — drop a topic to Skipping, push one to Going
          deeper, or mark it Done.
        </p>
      </header>

      {focus ? (
        <div className="mb-6 rounded-lg border border-blue-600 bg-blue-600 px-4 py-3 text-sm text-white">
          <span className="text-blue-200">Currently probing · </span>
          {focus}
        </div>
      ) : null}

      <div className="space-y-8">
        {tree.map((node) => (
          <SubjectNode key={node.subject.id} node={node} />
        ))}
      </div>
    </main>
  )
}

function SubjectNode({ node }: { node: DashboardSubject }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {node.subject.name}
      </h2>
      <div className="space-y-4">
        {node.curricula.length === 0 ? (
          <p className="text-sm text-neutral-300">No curricula yet.</p>
        ) : (
          node.curricula.map((item) => (
            <CurriculumNode key={item.curriculum.id} item={item} />
          ))
        )}
      </div>
    </section>
  )
}

function CurriculumNode({ item }: { item: DashboardCurriculum }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function change(status: LearningStatus) {
    setBusy(true)
    await setCurriculumStatus({
      data: { curriculumId: item.curriculum.id, learningStatus: status },
    })
    setBusy(false)
    await router.invalidate()
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <Link
          to="/curriculum/$curriculumId"
          params={{ curriculumId: item.curriculum.id }}
          className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
        >
          {item.curriculum.name}
        </Link>
        <LearningStatusSelect
          value={item.curriculum.learningStatus}
          onChange={change}
          disabled={busy}
        />
      </div>
      <div className="space-y-1 p-2">
        {item.modules.length === 0 ? (
          <p className="px-2 py-1 text-xs text-neutral-300">
            Not drafted yet.
          </p>
        ) : (
          item.modules.map((module) => (
            <ModuleNode key={module.id} module={module} />
          ))
        )}
      </div>
    </div>
  )
}

function ModuleNode({ module }: { module: Module }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function change(status: LearningStatus) {
    setBusy(true)
    await setModuleStatus({
      data: { moduleId: module.id, learningStatus: status },
    })
    setBusy(false)
    await router.invalidate()
  }

  return (
    <div className="px-2 py-1">
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {module.title}{' '}
          <span className="text-xs text-neutral-400">
            · {module.progress.percent}%
          </span>
        </span>
        <LearningStatusSelect
          value={module.learningStatus}
          onChange={change}
          disabled={busy}
        />
      </div>
      <div className="ml-2 border-l border-neutral-100 pl-3">
        {module.topics.map((topic) => (
          <TopicNode key={topic.id} topic={topic} />
        ))}
      </div>
    </div>
  )
}

function TopicNode({ topic }: { topic: Topic }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function change(status: LearningStatus) {
    setBusy(true)
    await setTopicState({ data: { topicId: topic.id, learningStatus: status } })
    setBusy(false)
    await router.invalidate()
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          topic.learningStatus === 'skipping'
            ? 'text-neutral-400 line-through'
            : 'text-neutral-700'
        }`}
      >
        {topic.title}{' '}
        <span className="text-xs text-neutral-400">
          · {topic.progress.maturity}% mature
        </span>
      </span>
      <LearningStatusSelect
        value={topic.learningStatus}
        onChange={change}
        disabled={busy}
      />
    </div>
  )
}

function findFocus(tree: DashboardSubject[]): string | null {
  for (const subjectNode of tree) {
    for (const item of subjectNode.curricula) {
      for (const module of item.modules) {
        for (const topic of module.topics) {
          if (topic.learningStatus === 'probing') {
            return `${item.curriculum.name} › ${module.title} › ${topic.title}`
          }
        }
      }
    }
  }

  return null
}
