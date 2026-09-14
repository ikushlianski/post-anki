import { useState } from 'react'

import type { DepthLevel, GoDeeperRefetchOutcome, LearningStatus } from '@post-anki/shared'

import { DepthPrompt } from './depth-prompt'
import { HeadroomOffer } from './headroom-offer'
import { electedDepthForTopic, nextDepthElectedAt } from './depth-choice'
import { declineHeadroomOffer, electTopicDepth } from './learning-list.api'

const SILENT_GO_DEEPER_OUTCOMES = new Set<GoDeeperRefetchOutcome>([
  'ok',
  'skipped',
  'not_refetchable',
])

export interface TopicDepthGateProps {
  topicId: string
  topicTitle: string
  depth: string
  depthElectedAt: string | null
  headroomOfferedAt: string | null
  mastered: boolean
  onChanged: () => void | Promise<void>
}

export function TopicDepthGate({
  topicId,
  topicTitle,
  depth,
  depthElectedAt,
  headroomOfferedAt,
  mastered,
  onChanged,
}: TopicDepthGateProps) {
  const [elected, setElected] = useState<DepthLevel | null>(() =>
    electedDepthForTopic({ depthElectedAt, depth }),
  )
  const [electedAt, setElectedAt] = useState(depthElectedAt)
  const [lastOfferAt, setLastOfferAt] = useState(headroomOfferedAt)
  const [now] = useState(() => new Date().toISOString())
  const [failed, setFailed] = useState(false)
  const [headroomFailed, setHeadroomFailed] = useState(false)
  const [staleSourceNotice, setStaleSourceNotice] = useState(false)

  async function elect(next: DepthLevel, status: LearningStatus) {
    setFailed(false)
    setStaleSourceNotice(false)

    const stampedAt = nextDepthElectedAt(electedAt, new Date().toISOString())

    const result = await electTopicDepth({
      data: { topicId, depth: next, learningStatus: status, depthElectedAt: stampedAt },
    })

    if (!result.ok) {
      setFailed(true)
      return
    }

    const refetchOutcome = result.data.goDeeperRefetch?.outcome

    if (refetchOutcome && !SILENT_GO_DEEPER_OUTCOMES.has(refetchOutcome)) {
      setStaleSourceNotice(true)
    }

    setElected(next)
    setElectedAt(stampedAt)
    await onChanged()
  }

  async function decline(offeredAt: string) {
    setHeadroomFailed(false)
    setLastOfferAt(offeredAt)

    const result = await declineHeadroomOffer({
      data: { topicId, headroomOfferedAt: offeredAt },
    })

    if (!result.ok) {
      setHeadroomFailed(true)
    }
  }

  return (
    <>
      <DepthPrompt
        topicTitle={topicTitle}
        electedDepth={elected}
        onElect={(next) => elect(next, 'probing')}
      />
      <HeadroomOffer
        electedDepth={elected}
        mastered={mastered}
        lastOfferAt={lastOfferAt}
        now={now}
        onAccept={(next) => elect(next, 'going_deeper')}
        onDecline={decline}
      />
      {failed ? (
        <p
          role="alert"
          data-testid="depth-election-error"
          className="mb-4 text-xs text-rose-700"
        >
          That depth was not saved — nothing changed. Try again.
        </p>
      ) : null}
      {headroomFailed ? (
        <p
          role="alert"
          data-testid="headroom-decline-error"
          className="mb-4 text-xs text-rose-700"
        >
          That preference was not saved — it may ask again. Try again.
        </p>
      ) : null}
      {staleSourceNotice ? (
        <p
          role="status"
          data-testid="go-deeper-stale-source-notice"
          className="mb-4 text-xs text-amber-700"
        >
          Couldn't refresh the source page — using the last version.
        </p>
      ) : null}
    </>
  )
}
