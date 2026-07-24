import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import type {
  SplitSuggestion,
  StructureResearchCandidate,
  StructureSnapshot,
  StructureTurn,
} from '@post-anki/shared'
import { estimateStructureStudyTime } from '@post-anki/core'
import { confirmStructure, resolveSupplementalResearch, submitStructureTurn } from './curriculum.api'
import { structureTurnsQuery } from './curriculum.queries'

function latestSnapshot(
  turns: { structureSnapshot: StructureSnapshot | null }[],
): StructureSnapshot | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i]!.structureSnapshot) {
      return turns[i]!.structureSnapshot
    }
  }

  return null
}

/**
 * A split suggestion is only actionable while it's the most recent
 * assistant turn — an older one has already been superseded by whatever
 * happened next in the conversation.
 */
function pendingSplitSuggestion(turns: StructureTurn[]): SplitSuggestion | null {
  const lastAssistantTurn = [...turns].reverse().find((t) => t.role === 'assistant')

  return lastAssistantTurn?.splitSuggestion ?? null
}

/**
 * Supplemental research candidates are only actionable while still attached
 * to the most recent assistant turn — same reasoning as
 * `pendingSplitSuggestion` above: once the learner resolves them (or a
 * later turn supersedes this one), they stop being the latest turn's own
 * field and this naturally returns an empty list.
 */
function pendingResearchCandidates(turns: StructureTurn[]): StructureResearchCandidate[] {
  const lastAssistantTurn = [...turns].reverse().find((t) => t.role === 'assistant')

  return lastAssistantTurn?.pendingResearchCandidates ?? []
}

/**
 * A turn found "pending" is normally impossible to observe — the API call
 * that writes it blocks until the turn resolves — UNLESS the server
 * crashed mid-turn and left it stuck. Only the very last turn is ever
 * treated as stuck: an older pending turn would already have been
 * self-healed into "failed" by the next `submitStructureTurn` call (see
 * that function's `finalizeStalePendingTurn`).
 */
function stuckPendingTurn(turns: StructureTurn[]): StructureTurn | null {
  const last = turns[turns.length - 1]

  return last && last.role === 'assistant' && last.status === 'pending' ? last : null
}

function lastUserMessageBefore(turns: StructureTurn[], turnId: string): string | null {
  const index = turns.findIndex((t) => t.id === turnId)

  for (let i = index - 1; i >= 0; i -= 1) {
    if (turns[i]!.role === 'user') {
      return turns[i]!.message
    }
  }

  return null
}

const GUARD_MESSAGES: Record<'turn_in_progress' | 'turn_limit_reached', string> = {
  turn_in_progress: 'Still working on your last message — try again in a moment.',
  turn_limit_reached:
    'This conversation has reached its limit — confirm the current structure or start a new course to keep refining.',
}

export function CurriculumStructureChat({ curriculumId }: { curriculumId: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: turns } = useSuspenseQuery(structureTurnsQuery(curriculumId))
  const [message, setMessage] = useState('')
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const snapshot = latestSnapshot(turns)
  const splitSuggestion = pendingSplitSuggestion(turns)
  const stuckTurn = stuckPendingTurn(turns)
  const researchCandidates = pendingResearchCandidates(turns)
  const [removedCandidateIds, setRemovedCandidateIds] = useState<Set<string>>(new Set())

  /**
   * Returns whether the message was actually accepted — `send()` only
   * clears the input/flags on `true`, so a rejected message (still in
   * progress, or the conversation hit its turn cap) stays in the box for
   * the learner to retry rather than silently disappearing.
   */
  async function sendMessage(text: string, researchGapLabels?: string[]): Promise<boolean> {
    setBusy(true)
    setError(null)

    const result = await submitStructureTurn({
      data: { curriculumId, message: text, researchGapLabels },
    })

    if (!result.ok) {
      setError(GUARD_MESSAGES[result.code])
      setBusy(false)
      return false
    }

    await queryClient.invalidateQueries({ queryKey: ['curriculum-structure-turns', curriculumId] })
    setBusy(false)
    return true
  }

  function toggleFlag(label: string) {
    setFlagged((prev) => {
      const next = new Set(prev)

      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }

      return next
    })
  }

  async function send(event: FormEvent) {
    event.preventDefault()

    const trimmed = message.trim()

    if (!trimmed) {
      return
    }

    const sent = await sendMessage(trimmed, flagged.size > 0 ? Array.from(flagged) : undefined)

    if (sent) {
      setMessage('')
      setFlagged(new Set())
    }
  }

  async function acceptSplitSuggestion() {
    await sendMessage(
      'Yes, please split the course into the suggested courses using splitModuleIntoNewCourse for each group.',
    )
  }

  async function declineSplitSuggestion() {
    await sendMessage('No, keep it as one course for now.')
  }

  function toggleRemoveCandidate(candidateId: string) {
    setRemovedCandidateIds((prev) => {
      const next = new Set(prev)

      if (next.has(candidateId)) {
        next.delete(candidateId)
      } else {
        next.add(candidateId)
      }

      return next
    })
  }

  async function resolveResearchCandidates(approvedCandidateIds: string[]) {
    setBusy(true)
    setError(null)

    const result = await resolveSupplementalResearch({ data: { curriculumId, approvedCandidateIds } })

    if (!result.ok) {
      setError(GUARD_MESSAGES[result.code])
      setBusy(false)
      return
    }

    setRemovedCandidateIds(new Set())
    await queryClient.invalidateQueries({ queryKey: ['curriculum-structure-turns', curriculumId] })
    setBusy(false)
  }

  async function useResearchCandidates() {
    const approvedCandidateIds = researchCandidates
      .map((c) => c.id)
      .filter((id) => !removedCandidateIds.has(id))

    await resolveResearchCandidates(approvedCandidateIds)
  }

  async function skipResearchCandidates() {
    await resolveResearchCandidates([])
  }

  async function resendStuckTurn() {
    if (!stuckTurn) {
      return
    }

    const original = lastUserMessageBefore(turns, stuckTurn.id)

    if (!original) {
      return
    }

    await sendMessage(original)
  }

  async function confirm() {
    setBusy(true)
    setError(null)

    try {
      await confirmStructure({ data: curriculumId })
      await router.invalidate()
    } catch {
      setError("Couldn't build the course from this structure — try again.")
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="structure-chat-panel"
      className="mb-6 rounded-lg border border-neutral-300 bg-white p-6"
    >
      <h2 className="text-sm font-medium text-neutral-700">Shape the course structure</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Review the drafted structure below. Flag anything you want researched
        further, or just tell the mentor what to change — then confirm when
        it looks right.
      </p>

      {snapshot ? (
        <div className="mt-4">
          <StudyTimeReadout snapshot={snapshot} />
          <div data-testid="structure-draft-tree" className="mt-3 space-y-3">
            {snapshot.modules.map((module, moduleIndex) => (
              <div
                key={`${module.title}-${moduleIndex}`}
                data-testid="structure-draft-module"
                className="rounded-md border border-neutral-200 p-3"
              >
                <label className="flex items-start gap-2 text-sm font-medium text-neutral-800">
                  <input
                    type="checkbox"
                    checked={flagged.has(module.title)}
                    onChange={() => toggleFlag(module.title)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="mr-1 text-xs uppercase text-neutral-400">
                      {module.level}
                    </span>
                    {module.title}
                  </span>
                </label>
                {module.topics.length > 0 ? (
                  <ul className="ml-6 mt-2 space-y-1">
                    {module.topics.map((topic, topicIndex) => (
                      <li key={`${topic.title}-${topicIndex}`}>
                        <label className="flex items-start gap-2 text-sm text-neutral-600">
                          <input
                            type="checkbox"
                            checked={flagged.has(topic.title)}
                            onChange={() => toggleFlag(topic.title)}
                            className="mt-0.5"
                          />
                          <span>{topic.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500" data-testid="structure-draft-pending">
          Drafting the first version of the structure…
        </p>
      )}

      <div className="mt-5 space-y-2 border-t border-neutral-100 pt-4">
        {turns.map((turn) => {
          const failed = turn.role === 'assistant' && turn.status === 'failed'
          const stuck = turn.id === stuckTurn?.id

          return (
            <div key={turn.id}>
              <p
                data-testid="structure-turn"
                data-turn-status={turn.status}
                className="text-sm"
              >
                <span className="font-medium text-neutral-700">
                  {turn.role === 'user' ? 'You' : 'Mentor'}:{' '}
                </span>
                <span className={failed ? 'text-red-600' : 'text-neutral-600'}>
                  {turn.message}
                </span>
              </p>
              {stuck ? (
                <div className="ml-4 mt-1 flex items-center gap-2">
                  <p className="text-xs text-red-600">
                    That reply didn’t come through.
                  </p>
                  <button
                    type="button"
                    onClick={resendStuckTurn}
                    disabled={busy}
                    data-testid="structure-turn-resend"
                    className="text-xs font-medium text-red-700 underline underline-offset-2 disabled:opacity-50"
                  >
                    Resend
                  </button>
                </div>
              ) : null}
              {turn.toolActions.map((action, actionIndex) => (
                <p
                  key={actionIndex}
                  data-testid="structure-turn-tool-action"
                  className="ml-4 text-xs text-neutral-400"
                >
                  → {action}
                </p>
              ))}
            </div>
          )
        })}
      </div>

      {splitSuggestion ? (
        <div
          data-testid="structure-split-suggestion"
          className="mt-4 rounded-md border border-indigo-300 bg-indigo-50 p-3 text-sm"
        >
          <p className="text-indigo-800">{splitSuggestion.reason}</p>
          <ul className="mt-2 space-y-1 text-indigo-700">
            {splitSuggestion.groups.map((group, groupIndex) => (
              <li key={groupIndex}>
                <strong>{group.courseName}</strong>: {group.moduleTitles.join(', ')}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={acceptSplitSuggestion}
              disabled={busy}
              data-testid="structure-split-accept"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Split into these courses
            </button>
            <button
              type="button"
              onClick={declineSplitSuggestion}
              disabled={busy}
              data-testid="structure-split-decline"
              className="rounded-md border border-indigo-300 px-3 py-1.5 text-sm text-indigo-700 disabled:opacity-50"
            >
              Keep as one course
            </button>
          </div>
        </div>
      ) : null}

      {researchCandidates.length > 0 ? (
        <div
          data-testid="research-candidates-review"
          className="mt-4 rounded-md border border-neutral-300 bg-white p-3 text-sm"
        >
          <p className="text-neutral-700">
            Review these sources before the mentor makes the edit. Remove anything you don't trust.
          </p>
          <ul className="mt-2 space-y-2" data-testid="research-candidate-list">
            {researchCandidates.map((candidate) => {
              const removed = removedCandidateIds.has(candidate.id)

              return (
                <li
                  key={candidate.id}
                  data-testid="research-candidate-row"
                  className={`flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-2 ${removed ? 'opacity-50' : ''}`}
                >
                  <div className="min-w-0">
                    <a
                      href={candidate.value}
                      target="_blank"
                      rel="noreferrer"
                      className="break-words text-blue-600 underline underline-offset-2"
                    >
                      {candidate.title}
                    </a>
                    <p className="mt-0.5 truncate text-xs text-neutral-400">{candidate.value}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRemoveCandidate(candidate.id)}
                    disabled={busy}
                    data-testid="research-candidate-remove"
                    className="shrink-0 text-neutral-400 hover:text-red-600 disabled:opacity-50"
                    aria-label={removed ? 'Restore candidate' : 'Remove candidate'}
                  >
                    {removed ? 'Restore' : 'Remove'}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={useResearchCandidates}
              disabled={busy}
              data-testid="research-candidates-use"
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Use these'}
            </button>
            <button
              type="button"
              onClick={skipResearchCandidates}
              disabled={busy}
              data-testid="research-candidates-skip"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50"
            >
              Skip these
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Tell the mentor what to change…"
          data-testid="structure-chat-input"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="structure-chat-send"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}

      <div className="mt-5">
        <button
          type="button"
          onClick={confirm}
          disabled={busy || !snapshot}
          data-testid="structure-chat-confirm"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Building…' : 'Build this course'}
        </button>
      </div>
    </div>
  )
}

function StudyTimeReadout({ snapshot }: { snapshot: StructureSnapshot }) {
  const estimate = estimateStructureStudyTime(snapshot.modules)
  const over = estimate.estimatedWeeks > 8

  return (
    <p
      data-testid="structure-study-time-estimate"
      className={`text-xs ${over ? 'text-amber-700' : 'text-neutral-500'}`}
    >
      Roughly <strong>{estimate.estimatedWeeks}</strong>{' '}
      {estimate.estimatedWeeks === 1 ? 'week' : 'weeks'} of study — {estimate.totalTopics} topics
      across {estimate.totalModules} modules.
      {over ? ' That is past the usual 4-8 week target for a course.' : ''}
    </p>
  )
}
