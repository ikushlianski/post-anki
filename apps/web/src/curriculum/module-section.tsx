import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'

import type { Module } from './model'
import { ProgressBar } from './progress-bar'
import { TopicRow } from './topic-row'
import {
  createTopic,
  deleteModule,
  reorderModules,
  updateModule,
} from './curriculum.api'
import {
  AddInline,
  ConfirmDelete,
  InlineRename,
  ReorderButtons,
  moveInOrder,
} from './shape-controls'

export function ModuleSection({
  module,
  recommendedTopicId,
  canProbe,
  editable,
  curriculumId,
  moduleOrder,
  allModules,
}: {
  module: Module
  recommendedTopicId: string | null
  canProbe: boolean
  editable: boolean
  curriculumId: string
  moduleOrder: string[]
  allModules: { id: string; title: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const index = moduleOrder.indexOf(module.id)
  const topicOrder = module.topics.map((topic) => topic.id)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    await fn()
    setBusy(false)
    await router.invalidate()
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          {editable ? (
            <ReorderButtons
              canUp={index > 0}
              canDown={index < moduleOrder.length - 1}
              busy={busy}
              onMove={(direction) =>
                run(() =>
                  reorderModules({
                    data: {
                      curriculumOrModuleId: curriculumId,
                      orderedIds: moveInOrder(moduleOrder, module.id, direction),
                    },
                  }),
                )
              }
            />
          ) : null}
          <h3 className="text-base font-semibold tracking-tight">
            {editable ? (
              <InlineRename
                value={module.title}
                busy={busy}
                onSave={(title) =>
                  run(() => updateModule({ data: { moduleId: module.id, title } }))
                }
              />
            ) : (
              module.title
            )}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">
            {module.progress.topicsMastered}/{module.progress.topicsIncluded}{' '}
            mastered · {module.progress.percent}%
          </span>
          {editable ? (
            <ConfirmDelete
              busy={busy}
              label="Delete module"
              onConfirm={() => run(() => deleteModule({ data: module.id }))}
            />
          ) : null}
        </div>
      </div>

      <ProgressBar percent={module.progress.percent} />

      <div className="mt-4 space-y-3">
        {module.topics.map((topic) => (
          <TopicRow
            key={topic.id}
            topic={topic}
            recommended={topic.id === recommendedTopicId}
            canProbe={canProbe}
            editable={editable}
            topicOrder={topicOrder}
            moduleId={module.id}
            curriculumId={curriculumId}
            allModules={allModules}
          />
        ))}
        {module.topics.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No topics in this module yet.
          </p>
        ) : null}
      </div>

      {editable ? (
        <div className="mt-3">
          <AddInline
            cta="+ Add topic"
            placeholder="Topic title…"
            busy={busy}
            onAdd={(title) =>
              run(() => createTopic({ data: { moduleId: module.id, title } }))
            }
          />
        </div>
      ) : null}
    </section>
  )
}
