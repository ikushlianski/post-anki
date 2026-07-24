import { useState } from 'react'
import { Link } from '@tanstack/react-router'

import type { CurriculumDetail, QuestionKind } from './model'

export function ProbeRoomDrawer({
  detail,
  currentTopicId,
  mode,
}: {
  detail: CurriculumDetail
  currentTopicId: string
  mode: QuestionKind
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-neutral-500"
      >
        ☰ Curriculum
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="flex-1 bg-black/30"
          />
          <aside className="flex h-full w-80 max-w-[85vw] flex-col overflow-y-auto border-l border-neutral-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-semibold">
                {detail.curriculum.name}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 text-xs text-neutral-400 hover:text-neutral-700"
              >
                Close
              </button>
            </div>

            <p className="mb-3 text-[11px] text-neutral-400">
              Jump to any topic. Answers you’ve already submitted are saved;
              an unsent draft on the current question is not.
            </p>

            <div className="space-y-4">
              {detail.modules.map((module) => (
                <div key={module.id}>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                    {module.title}
                  </p>
                  <ul className="space-y-0.5">
                    {module.topics
                      .filter((topic) => topic.included)
                      .map((topic) => (
                        <li key={topic.id}>
                          <Link
                            to="/probe/$topicId"
                            params={{ topicId: topic.id }}
                            search={{
                              mode,
                              curriculumId: detail.curriculum.id,
                            }}
                            onClick={() => setOpen(false)}
                            className={`block rounded px-2 py-1 text-sm ${
                              topic.id === currentTopicId
                                ? 'bg-neutral-900 text-white'
                                : 'text-neutral-700 hover:bg-neutral-100'
                            }`}
                          >
                            {topic.title}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-1 border-t border-neutral-100 pt-4 text-xs">
              <Link
                to="/curriculum/$curriculumId"
                params={{ curriculumId: detail.curriculum.id }}
                className="block text-neutral-500 hover:text-neutral-900"
              >
                ← Back to full curriculum
              </Link>
              <Link to="/" className="block text-neutral-500 hover:text-neutral-900">
                All curricula
              </Link>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}
