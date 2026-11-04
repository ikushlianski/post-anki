import { nextPriority } from '@post-anki/core'

import type { Topic } from './model'
import { ActionFailedLine } from './action-failed-line'
import { useGuardedRun } from './use-guarded-run'
import { deleteTopic, reorderTopics, setTopicState } from './curriculum.api'
import { usePromoteDemoteTopic } from './curriculum.mutations'
import {
  ConfirmDelete,
  PromoteDemoteButtons,
  ReorderButtons,
  moveInOrder,
} from './shape-controls'

export function TopicShapeBar({
  topic,
  topicOrder,
  moduleId,
  curriculumId,
  allModules,
  hydrated,
}: {
  topic: Topic
  topicOrder: string[]
  moduleId: string
  curriculumId: string
  allModules: { id: string; title: string }[]
  hydrated: boolean
}) {
  const { busy, failed, run } = useGuardedRun()
  const index = topicOrder.indexOf(topic.id)
  const otherModules = allModules.filter((module) => module.id !== moduleId)
  const promoteDemoteMutation = usePromoteDemoteTopic(curriculumId)

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
      <ReorderButtons
        canUp={index > 0}
        canDown={index < topicOrder.length - 1}
        busy={busy}
        hydrated={hydrated}
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
      <PromoteDemoteButtons
        priority={topic.priority}
        busy={promoteDemoteMutation.isPending}
        hydrated={hydrated}
        promoteTestId={`topic-promote-${topic.id}`}
        demoteTestId={`topic-demote-${topic.id}`}
        onToggle={(direction) =>
          promoteDemoteMutation.mutate({
            topicId: topic.id,
            priority: nextPriority(topic.priority, direction),
          })
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
        hydrated={hydrated}
        label="Delete topic"
        consequence="Deletes this topic and its cards"
        onConfirm={() => run(() => deleteTopic({ data: topic.id }))}
      />
      <ActionFailedLine failed={failed} testId={`topic-action-failed-${topic.id}`} />
    </div>
  )
}
