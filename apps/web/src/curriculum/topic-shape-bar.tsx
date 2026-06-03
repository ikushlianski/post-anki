import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'

import type { Topic } from './model'
import { deleteTopic, reorderTopics, setTopicState } from './curriculum.api'
import { ConfirmDelete, ReorderButtons, moveInOrder } from './shape-controls'

export function TopicShapeBar({
  topic,
  topicOrder,
  moduleId,
  allModules,
}: {
  topic: Topic
  topicOrder: string[]
  moduleId: string
  allModules: { id: string; title: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const index = topicOrder.indexOf(topic.id)
  const otherModules = allModules.filter((module) => module.id !== moduleId)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    await fn()
    setBusy(false)
    await router.invalidate()
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
      <ReorderButtons
        canUp={index > 0}
        canDown={index < topicOrder.length - 1}
        busy={busy}
        onMove={(direction) =>
          run(() =>
            reorderTopics({
              data: {
                curriculumOrModuleId: moduleId,
                orderedIds: moveInOrder(topicOrder, topic.id, direction),
              },
            }),
          )
        }
      />
      {otherModules.length > 0 ? (
        <label className="flex items-center gap-1">
          move to
          <select
            value=""
            disabled={busy}
            onChange={(event) => {
              if (event.target.value) {
                run(() =>
                  setTopicState({
                    data: { topicId: topic.id, moduleId: event.target.value },
                  }),
                )
              }
            }}
            className="rounded border border-neutral-200 bg-white px-1 py-0.5 outline-none focus:border-neutral-400"
          >
            <option value="">module…</option>
            {otherModules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <ConfirmDelete
        busy={busy}
        label="Delete topic"
        onConfirm={() => run(() => deleteTopic({ data: topic.id }))}
      />
    </div>
  )
}
